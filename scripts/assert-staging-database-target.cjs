/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { Client } = require("pg");

// Release tooling only: never imported into the application or enabled by a
// normal build. These endpoints were verified in the approved staging project.
const stagingBranches = {
  "ep-fragrant-heart-b578tydw": "br-delicate-credit-b5lttgnc",
  "ep-fragrant-sun-b5xzle76": "br-dry-mouse-b5kctz0n",
};

function assertStagingTarget(env) {
  if (env.VERCEL_ENV !== "preview" || env.VERCEL !== "1" || env.MUNSHIOS_DEPLOYMENT_ENVIRONMENT !== "staging" || env.VERCEL_PROJECT_ID !== "prj_ytXqF1zAoJjcsBIICz7PryfAczLz") {
    throw new Error("Refusing staging migration outside the approved preview project.");
  }
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error("Invalid staging database configuration."); }
  const match = url.hostname.match(/^(ep-[a-z0-9-]+?)(?:-pooler)?\.c-7\.us-east-2\.aws\.neon\.tech$/);
  const branch = match && stagingBranches[match[1]];
  const routingOverrides = new Set(["host", "hostaddr", "port", "database", "dbname", "service", "connectionstring", "options"]);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !branch || url.pathname !== "/neondb" || (url.port && url.port !== "5432") || (url.searchParams.get("schema") || "public") !== "public" || [...url.searchParams.keys()].some(key => routingOverrides.has(key.toLowerCase()))) {
    throw new Error("Refusing migration: database does not match a verified staging endpoint.");
  }
  return { host: url.hostname, database: "neondb", schema: "public", project: "wandering-moon-51932710", branch };
}

async function main() {
  const target = assertStagingTarget(process.env);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"');
    const root = path.join(__dirname, "../prisma/migrations");
    const expected = fs.readdirSync(root).filter(name => fs.existsSync(path.join(root, name, "migration.sql")));
    const applied = rows.filter(row => row.finished_at && !row.rolled_back_at);
    if (expected.length !== 130 || ![129, 130].includes(applied.length) || rows.some(row => !row.finished_at && !row.rolled_back_at)) {
      throw new Error("Staging migration history requires investigation before deployment.");
    }
    for (const row of applied) {
      if (!expected.includes(row.migration_name)) throw new Error("Unknown migration in staging history.");
      const bytes = fs.readFileSync(path.join(root, row.migration_name, "migration.sql"));
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== row.checksum) throw new Error(`Staging migration checksum mismatch: ${row.migration_name}`);
    }
    const pending = expected.filter(name => !applied.some(row => row.migration_name === name));
    if (pending.some(name => name !== "20261007183000_user_policy_acceptance")) throw new Error("Unexpected pending staging migration.");
    const counts = await client.query('SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM workspace_members) AS memberships, (SELECT count(*) FROM workspaces) AS workspaces, (SELECT count(*) FROM restaurant_orders) AS restaurant_orders');
    console.log(JSON.stringify({ stagingDatabase: target, migrations: applied.length, pending, before: counts.rows[0], checksumValidation: "PASS" }));
  } finally {
    await client.end();
  }
}

module.exports = { assertStagingTarget };
if (require.main === module) main().catch(() => {
  // Connection errors can contain credentials; never serialize the driver error.
  console.error("Staging database guard failed; no migration was authorized by this guard.");
  process.exitCode = 1;
});
