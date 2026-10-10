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
const { hasSafeNeonUrlOptions } = require("./safe-neon-url-options.cjs");
const { assertEmptyDatabase, assertSterileSchema } = require("./sterile-schema-attestation.cjs");

const REQUIRED_APPROVAL = "I_APPROVE_NEW_STERILE_DATABASE_ONLY";

// Stage identifiers are fixed literals only: never emit exceptions, Prisma logs or URLs.
let failureStage = "TARGET_VALIDATION";
const noteStage = stage => { failureStage = stage; };


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
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !url.username || !url.password
    || !target.approvedHostnames.includes(url.hostname)
    || !/^ep-[a-z0-9-]+\.c-6\.us-east-2\.aws\.neon\.tech$/.test(url.hostname)
    || url.pathname !== "/neondb" || (url.port && url.port !== "5432")
    || !hasSafeNeonUrlOptions(url)) {
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
    || files[129] !== "20261007183000_user_policy_acceptance"
    || files[130] !== "20261008112000_restaurant_staff_stations"
    || files[131] !== "20261008160000_round3_recovery_buckets_sales_cursor") {
    throw new Error("Unexpected Prisma migration catalog; abort for review.");
  }
  return files;
}

function assertAppliedHistory(names, rows) {
  if (rows.length !== names.length || new Set(rows.map(x=>x.migration_name)).size !== names.length
    || rows.some(x => !x.finished_at || x.rolled_back_at || x.applied_steps_count !== 1)) {
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
  const ordered = [...rows].sort((a,b) => new Date(a.started_at) - new Date(b.started_at));
  if (ordered.some((row, i) => row.migration_name !== names[i]
    || !Number.isFinite(new Date(row.started_at).getTime())
    || !Number.isFinite(new Date(row.finished_at).getTime())
    || new Date(row.finished_at) < new Date(row.started_at)
    || (i && new Date(row.started_at) < new Date(ordered[i-1].finished_at)))) {
    throw new Error("Sterile migration execution ordering mismatch.");
  }
}

function assertPrivateExecution(env) {
  if (Object.keys(env).some(key => env[key] && (/^PG/i.test(key) || /^PRISMA_/i.test(key)
    || ["NODE_OPTIONS","NODE_TLS_REJECT_UNAUTHORIZED","NODE_EXTRA_CA_CERTS","DEBUG","NODE_DEBUG","RUST_LOG","RUST_BACKTRACE"].includes(key)))) {
    throw new Error("Remove inherited database, engine, TLS or diagnostic overrides in the private shell.");
  }
  if (!/^[a-f0-9]{40}$/.test(env.STERILE_CANDIDATE_SHA ?? "")) throw new Error("Exact reviewed candidate SHA required.");
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const clean = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (head.status !== 0 || head.stdout.trim() !== env.STERILE_CANDIDATE_SHA || clean.status !== 0 || clean.stdout.trim()) {
    throw new Error("Migration requires the exact reviewed commit and a clean private checkout.");
  }
  for (const dir of [root, path.join(root, "prisma")]) {
    if (fs.readdirSync(dir).some(name => name.startsWith(".env") && name !== ".env.example")) {
      throw new Error("Inject secrets only through the private process environment; dotenv files are not allowed.");
    }
  }
}

async function migrateEmptyDatabase(client, names, migrate, onStage = () => {}) {
  onStage("ADVISORY_LOCK");
  const lock = (await client.query("SELECT pg_try_advisory_lock(132, 20261010) AS acquired")).rows[0];
  if (!lock?.acquired) throw new Error("Another sterile migration operator is active; stop without retry.");
  try {
    onStage("EMPTY_SCHEMA_PRECHECK");
    await assertEmptyDatabase(client);
    onStage("MIGRATION_FILE_PRECHECK");
    const before = names.map(name => createHash("sha256").update(fs.readFileSync(path.join(root,"prisma/migrations",name,"migration.sql"))).digest("hex"));
    onStage("PRISMA_MIGRATE_DEPLOY");
    const result = await migrate();
    if (result.error || result.status !== 0) throw new Error("Prisma migration failed or timed out; stop for private operator review.");
    onStage("MIGRATION_FILE_POSTCHECK");
    if (names.some((name,i) => createHash("sha256").update(fs.readFileSync(path.join(root,"prisma/migrations",name,"migration.sql"))).digest("hex") !== before[i])) {
      throw new Error("Migration files changed during execution.");
    }
    onStage("POST_MIGRATION_RECONCILIATION");
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      onStage("MIGRATION_LEDGER_VERIFICATION");
      const applied = await client.query('SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count FROM public._prisma_migrations ORDER BY migration_name');
      assertAppliedHistory(names, applied.rows);
      onStage("SCHEMA_AND_SEED_ATTESTATION");
      return { migrations: names.length, ...await assertSterileSchema(client) };
    } finally { await client.query("ROLLBACK"); }
  } finally { await client.query("SELECT pg_advisory_unlock(132, 20261010)"); }
}

async function main() {
  noteStage("TARGET_VALIDATION");
  const identity = assertSterileMigrationTarget(process.env);
  noteStage("LOCAL_EXECUTION_GUARDS");
  assertPrivateExecution(process.env);
  noteStage("MIGRATION_CATALOG");
  const names = expectedMigrationCatalog();
  const prisma = path.join(root, "node_modules/prisma/build/index.js");
  if (!fs.existsSync(prisma)) throw new Error("Local Prisma CLI not installed.");
  // Prisma config already enforces verify-full; use the same TLS policy for pg.
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("sslmode", "verify-full");
  noteStage("DATABASE_DRIVER_SETUP");
  const { Client } = require("pg");
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000, query_timeout: 30000 });
  noteStage("DATABASE_CONNECT");
  await client.connect();
  try {
    noteStage("DATABASE_NAME_VERIFICATION");
    if ((await client.query("SELECT current_database() AS name")).rows[0]?.name !== identity.database) throw new Error("Database identity mismatch.");
    const result = await migrateEmptyDatabase(client, names, () => spawnSync(process.execPath, [prisma, "migrate", "deploy"], {
      cwd: root, env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000,
    }), noteStage);
    console.log(JSON.stringify({ result: "PASS", ...identity, ...result, users: 0, workspaces: 0, restaurantOrders: 0, credentialsPrinted: false }));
  } finally { await client.end(); }
}

module.exports = { assertSterileMigrationTarget, assertZeroPublicTables, expectedMigrationCatalog, assertAppliedHistory, assertPrivateExecution, migrateEmptyDatabase };
if (require.main === module) main().catch(() => {
  console.error(`Sterile migration FAILED at stage=${failureStage}. No error details or credentials were emitted.`);
  console.error("STOP. Do not retry, reset or deploy. Provide only this stage label for private review.");
  process.exitCode = 1;
});
