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
  "ep-muddy-sea-b51k2gi3": "br-sweet-hat-b5x5nzzz",
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

function migrationChecksumMatches(bytes, expectedChecksum) {
  const raw = createHash("sha256").update(bytes).digest("hex");
  if (raw === expectedChecksum) return true;

  // Older staging migrations were applied from a Windows checkout, so Prisma
  // recorded the checksum of CRLF bytes while Git now materializes the same SQL
  // with LF line endings. Accept ONLY line-ending-equivalent content; all other
  // whitespace or SQL changes must still fail checksum validation.
  const text = bytes.toString("utf8");
  const lf = text.replace(/\r\n/g, "\n");
  const crlf = lf.replace(/\n/g, "\r\n");
  const lfHash = createHash("sha256").update(lf, "utf8").digest("hex");
  const crlfHash = createHash("sha256").update(crlf, "utf8").digest("hex");
  return expectedChecksum === lfHash || expectedChecksum === crlfHash;
}

function assertPolicySchemaState(pending, columns) {
  const names = new Set(columns.map(row => row.column_name));
  const required = ["termsAcceptedAt", "termsVersion", "privacyAcknowledgedAt", "privacyVersion"];
  if (pending.length ? names.size !== 0 : !required.every(name => names.has(name))) {
    throw new Error("Policy schema and migration ledger disagree; investigate before migration.");
  }
}

const stationMigration = "20261008112000_restaurant_staff_stations";
const recoveryMigration = "20261008160000_round3_recovery_buckets_sales_cursor";

function assertStagingMigrationHistory(expected, rows) {
  const applied = rows.filter(row => row.finished_at && !row.rolled_back_at);
  const names = new Set(applied.map(row => row.migration_name));
  const supportedCatalog = [131, 132].includes(expected.length)
    && new Set(expected).size === expected.length
    && expected[130] === stationMigration
    && (expected.length === 131 || expected[131] === recoveryMigration);
  // Only a fully applied baseline followed by the known additive release tail
  // is allowed. A hole, duplicate successful entry or unfinished attempt fails.
  if (!supportedCatalog || applied.length < 130 || applied.length > expected.length
    || names.size !== applied.length || rows.some(row => !expected.includes(row.migration_name)
      || (!row.finished_at && !row.rolled_back_at))
    || expected.slice(0, applied.length).some(name => !names.has(name))) {
    throw new Error("Staging migration history requires investigation before deployment.");
  }
  return { applied, pending: expected.slice(applied.length) };
}

function assertRecoverySchemaState(pending, state) {
  const keys = ["table_present", "columns_valid", "constraints_valid", "bucket_index_valid", "sales_index_valid"];
  if (pending ? keys.some(key => state[key] !== false) : keys.some(key => state[key] !== true)) {
    throw new Error("Recovery schema and migration ledger disagree; investigate before migration.");
  }
}

// Single read-only projection shared by the live preflight and the disposable
// PostgreSQL integration test. Never make staging connection checks optional.
async function inspectRecoverySchemaState(client) {
  const result = await client.query(`SELECT
        to_regclass('public.auth_recovery_buckets') IS NOT NULL AS table_present,
        (SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_recovery_buckets' AND is_nullable='NO' AND
          ((column_name='emailHash' AND data_type='text') OR (column_name='windowStartedAt' AND data_type='timestamp with time zone' AND datetime_precision=3) OR (column_name='attempts' AND data_type='integer'))) AS columns_valid,
        (SELECT count(*) = 3 FROM pg_constraint WHERE conrelid=to_regclass('public.auth_recovery_buckets') AND convalidated AND
          ((conname='auth_recovery_buckets_pkey' AND contype='p') OR (conname IN ('auth_recovery_buckets_attempts_check','auth_recovery_buckets_hash_check') AND contype='c'))) AS constraints_valid,
        EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public."auth_recovery_buckets_windowStartedAt_idx"') AND i.indrelid=to_regclass('public.auth_recovery_buckets') AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND pg_get_indexdef(i.indexrelid) LIKE '% USING btree ("windowStartedAt")') AS bucket_index_valid,
        EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public."sales_orders_workspaceId_orderDate_id_idx"') AND i.indrelid=to_regclass('public.sales_orders') AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND pg_get_indexdef(i.indexrelid) LIKE '% USING btree ("workspaceId", "orderDate", id)') AS sales_index_valid`);
  return result.rows[0];
}

async function main() {
  const target = assertStagingTarget(process.env);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"');
    const root = path.join(__dirname, "../prisma/migrations");
    const expected = fs.readdirSync(root).filter(name => fs.existsSync(path.join(root, name, "migration.sql"))).sort();
    const { applied, pending } = assertStagingMigrationHistory(expected, rows);
    for (const row of applied) {
      if (!expected.includes(row.migration_name)) throw new Error("Unknown migration in staging history.");
      const bytes = fs.readFileSync(path.join(root, row.migration_name, "migration.sql"));
      if (!migrationChecksumMatches(bytes, row.checksum)) {
        throw new Error(`Staging migration checksum mismatch: ${row.migration_name}`);
      }
    }
    const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('termsAcceptedAt','termsVersion','privacyAcknowledgedAt','privacyVersion')");
    assertPolicySchemaState(pending.filter(name => name === "20261007183000_user_policy_acceptance"), columns.rows);
    const stationColumns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='workspace_members' AND column_name='restaurantStation'");
    const stationPending = pending.includes(stationMigration);
    if ((stationPending && stationColumns.rows.length !== 0) || (!stationPending && stationColumns.rows.length !== 1)) {
      throw new Error("Station schema and migration ledger disagree; investigate before migration.");
    }
    if (expected.includes(recoveryMigration)) {
      const recoveryState = await inspectRecoverySchemaState(client);
      assertRecoverySchemaState(pending.includes(recoveryMigration), recoveryState);
    }
    const counts = await client.query('SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM workspace_members) AS memberships, (SELECT count(*) FROM workspaces) AS workspaces, (SELECT count(*) FROM restaurant_orders) AS restaurant_orders');
    console.log(JSON.stringify({ stagingDatabase: target, migrations: applied.length, pending, before: counts.rows[0], checksumValidation: "PASS" }));
  } finally {
    await client.end();
  }
}

module.exports = { assertStagingTarget, assertPolicySchemaState, migrationChecksumMatches, assertStagingMigrationHistory, assertRecoverySchemaState, inspectRecoverySchemaState };
if (require.main === module) main().catch((error) => {
  // Connection errors can contain credentials; never serialize arbitrary driver errors.
  // Only surface our own fixed-format guard failures, which contain no connection values.
  const message = error instanceof Error ? error.message : "";
  const safe =
    /^(Staging migration checksum mismatch: [A-Za-z0-9_]+|Staging migration history requires investigation before deployment\.|Unknown migration in staging history\.|Policy schema and migration ledger disagree; investigate before migration\.|Station schema and migration ledger disagree; investigate before migration\.|Recovery schema and migration ledger disagree; investigate before migration\.|Refusing staging migration outside the approved preview project\.|Refusing migration: database does not match a verified staging endpoint\.|Invalid staging database configuration\.)$/.test(message)
      ? message
      : "Staging database guard failed; no migration was authorized by this guard.";
  console.error(safe);
  process.exitCode = 1;
});
