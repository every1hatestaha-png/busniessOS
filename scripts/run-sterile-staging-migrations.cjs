/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Opt-in, operator-only migration for a newly created EMPTY nonproduction Neon
 * project. Not invoked by Vercel, CI or ordinary builds. Never logs DB URLs.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const target = require("../config/preview-acceptance-targets.json");
const root = path.resolve(__dirname, "..");

const REQUIRED_APPROVAL = "I_APPROVE_NEW_STERILE_DATABASE_ONLY";

function assertSterileMigrationTarget(env) {
  if (env.CI || env.VERCEL || env.STERILE_MIGRATIONS_APPROVED !== REQUIRED_APPROVAL) {
    throw new Error("Sterile migration requires explicit local operator approval, outside CI/Vercel.");
  }
  if (env.NEON_PROJECT_ID !== target.stagingProjectId
    || env.NEON_BRANCH_ID !== target.stagingBranchId) {
    throw new Error("Sterile migration project/branch identity mismatch.");
  }
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error("Missing or invalid sterile database target."); }
  const blocked = new Set(["host", "hostaddr", "port", "database", "dbname", "service", "connectionstring", "options"]);
  const keys = Array.from(url.searchParams.keys());
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !url.username || !url.password
    || !target.approvedHostnames.includes(url.hostname)
    || !/^ep-[a-z0-9-]+\.c-6\.us-east-2\.aws\.neon\.tech$/.test(url.hostname)
    || url.pathname !== "/neondb" || (url.port && url.port !== "5432")
    || url.searchParams.get("sslmode") !== "require"
    || (url.searchParams.get("schema") || "public") !== "public"
    || keys.some(k => blocked.has(k.toLowerCase()))) {
    throw new Error("Sterile migration database is not the exclusively approved, direct Neon target.");
  }
  return { projectId: target.stagingProjectId, branchId: target.stagingBranchId, database: "neondb" };
}

function assertZeroPublicTables(names) {
  if (!Array.isArray(names) || names.length !== 0) {
    throw new Error("Sterile migration requires an empty public schema; existing tables are not eligible.");
  }
}

function expectedMigrationCatalog() {
  const dir = path.join(root, "prisma/migrations");
  const files = fs.readdirSync(dir).filter(name => fs.existsSync(path.join(dir, name, "migration.sql"))).sort();
  if (files.length !== 132
    || files[130] !== "20261008112000_restaurant_staff_stations"
    || files[131] !== "20261008160000_round3_recovery_buckets_sales_cursor") {
    throw new Error("Unexpected Prisma migration catalog; abort for review.");
  }
  return files;
}

function assertAppliedHistory(names, rows) {
  if (rows.length !== names.length || new Set(rows.map(x=>x.migration_name)).size !== names.length
    || rows.some(x => !x.finished_at || x.rolled_back_at)) {
    throw new Error("Sterile migration ledger is incomplete or contains a failed/rolled-back attempt.");
  }
  const actual = new Map(rows.map(x=>[x.migration_name, x.checksum]));
  for (const name of names) {
    const bytes = fs.readFileSync(path.join(root, "prisma/migrations", name, "migration.sql"));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (actual.get(name) !== hash) {
      throw new Error("Sterile migration checksum mismatch; no deployment is authorized.");
    }
  }
}

async function main() {
  const identity = assertSterileMigrationTarget(process.env);
  const names = expectedMigrationCatalog();
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const state = await client.query("SELECT current_database() AS name, pg_is_in_recovery() AS recovering");
    if (state.rows.length !== 1 || state.rows[0].name !== "neondb" || state.rows[0].recovering) {
      throw new Error("Sterile database identity or writable role failed.");
    }
    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    assertZeroPublicTables(tables.rows.map(x=>x.table_name));
  } finally { await client.end(); }

  // The local, pinned, already installed Prisma CLI is used directly.
  // No npx network resolution, unreviewed install, or shell interpretation.
  const prisma = path.join(root, "node_modules/prisma/build/index.js");
  if (!fs.existsSync(prisma)) throw new Error("Local Prisma CLI not installed.");
  const result = spawnSync(process.execPath, [prisma, "migrate", "deploy"], {
    cwd: root, env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000,
  });
  if (result.error || result.status !== 0) {
    throw new Error("Prisma migration did not complete; check the private operator environment. No release is authorized.");
  }

  const verification = new Client({ connectionString: process.env.DATABASE_URL });
  await verification.connect();
  try {
    const applied = await verification.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name');
    assertAppliedHistory(names, applied.rows);
    const counts = await verification.query(`SELECT
      (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM workspaces) AS workspaces,
      (SELECT COUNT(*)::int FROM restaurant_orders) AS restaurant_orders`);
    const state = counts.rows[0];
    if (state.tables !== 74 || state.users !== 0 || state.workspaces !== 0 || state.restaurant_orders !== 0) {
      throw new Error("Unexpected deployed schema or pre-existing tenant data; staging is blocked.");
    }
    console.log(JSON.stringify({ result: "PASS", projectId: identity.projectId,
      branchId: identity.branchId, migrations: names.length, tables: state.tables,
      users: 0, workspaces: 0, restaurantOrders: 0, credentialsPrinted: false }));
  } finally { await verification.end(); }
}

module.exports = { assertSterileMigrationTarget, assertZeroPublicTables, expectedMigrationCatalog, assertAppliedHistory };
if (require.main === module) main().catch(() => {
  console.error("Sterile migration preflight/reconciliation FAILED. Stop and inspect locally; no Preview is authorized.");
  process.exitCode = 1;
});
