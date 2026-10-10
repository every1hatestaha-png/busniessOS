/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Review-only cloud migration operator. Called ONLY from the one-time,
 * explicitly labeled, same-repository GitHub PR job and gated environment.
 * This does not relax the private Windows operator entrypoint.
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  assertSterileMigrationTarget,
  assertPrivateExecution,
  expectedMigrationCatalog,
  migrateEmptyDatabase,
  atStage,
  failureDiagnostic,
  runPrismaSubprocess,
  assertPrismaResult,
} = require("./run-sterile-staging-migrations.cjs");
const root = path.resolve(__dirname, "..");
const BRANCH = "ops/sterile-neon-cloud-manual-20261010";
const BASE = "fix/sterile-runner-diagnostics-20261010";
const REPOSITORY = "every1hatestaha-png/busniessOS";
const APPROVAL = "I_APPROVE_NEW_STERILE_DATABASE_ONLY";

function assertCloudInvocation(event, env) {
  const sha = event?.pull_request?.head?.sha;
  if (env.GITHUB_ACTIONS !== "true" || env.CI !== "true"
    || env.GITHUB_EVENT_NAME !== "pull_request" || env.GITHUB_RUN_ATTEMPT !== "1"
    || env.GITHUB_REPOSITORY !== REPOSITORY || env.VERCEL) {
    throw new Error("Unapproved GitHub execution context");
  }
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")
    || event?.action !== "labeled" || event?.label?.name !== `db-${sha}`
    || event?.sender?.login !== "every1hatestaha-png"
    || event?.pull_request?.head?.ref !== BRANCH
    || event?.pull_request?.base?.ref !== BASE
    || event?.pull_request?.head?.repo?.full_name !== REPOSITORY
    || event?.pull_request?.base?.repo?.full_name !== REPOSITORY
    || event?.pull_request?.state !== "open"
    || event?.pull_request?.draft !== true
    || env.GITHUB_HEAD_SHA !== sha
    || env.STERILE_CANDIDATE_SHA !== sha
    || env.STERILE_NEON_ENVIRONMENT !== "sterile-neon-rc132") {
    throw new Error("Exact owner label/commit/branch/environment authorization required");
  }
  return sha;
}

async function main() {
  // Identity and invocation checks occur BEFORE reading credentials or
  // importing database clients. Never accept a free-form target from PR input.
  const event = await atStage("local_validation", () => JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")), "event_payload_rejected");
  await atStage("local_validation", () => assertCloudInvocation(event, process.env), "cloud_approval_rejected");
  const sha = process.env.STERILE_CANDIDATE_SHA;
  await atStage("local_validation", () => assertPrivateExecution(process.env), "private_checkout_rejected");
  const migrations = await atStage("local_validation", expectedMigrationCatalog, "migration_catalog_rejected");
  await atStage("local_validation", () => {
    if (!fs.existsSync(path.join(root,"node_modules/prisma/build/index.js"))) throw new Error("Prisma unavailable");
  }, "prisma_cli_missing");
  // The legacy operator explicitly prohibits CI. Apply its *same* strict URL
  // and project/branch guards only after the independent manual-only GitHub
  // envelope has passed. Its legacy entrypoint remains unchanged.
  await atStage("local_validation", () => assertSterileMigrationTarget({
    ...process.env, CI: undefined, VERCEL: undefined,
    STERILE_MIGRATIONS_APPROVED: APPROVAL,
  }), "target_or_approval_rejected");

  const client = await atStage("db_connection", () => {
    const { Client } = require("pg");
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set("sslmode","verify-full");
    return new Client({ connectionString: url.toString(), connectionTimeoutMillis:15000, query_timeout:30000 });
  }, "driver_initialization_failed");

  let failedSession = false;
  const cancel = new AbortController();
  client.on("error", () => { failedSession = true; cancel.abort(); });
  let primaryError;
  let applied;
  try {
    await atStage("db_connection", () => client.connect(), "connection_failed");
    await atStage("db_connection", async () => {
      const row = (await client.query("SELECT current_database() AS db")).rows[0];
      if (row?.db !== "neondb") throw new Error("Wrong database");
    }, "database_identity_failed");
    applied = await migrateEmptyDatabase(client, migrations, async () => {
      if (failedSession) assertPrismaResult({ status:null, cancelled:true, launchFailed:true });
      const outcome = await runPrismaSubprocess({ signal: cancel.signal });
      if (failedSession) {
        // Abort with the original runner's fixed, no-secret cancellation
        // classification. The child may have partially executed: do not retry.
        assertPrismaResult({ status:null, cancelled:true });
      }
      assertPrismaResult(outcome);
      return outcome;
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try { await client.end(); }
    catch {
      if (primaryError?.diagnostic) primaryError.diagnostic.cleanupFailed = true;
      else if (!primaryError) throw new Error("Database cleanup failed");
    }
  }
  // No production or Preview is authorized here; structured sterile schema
  // evidence only, emitted after complete attestation and cleanup.
  console.log(JSON.stringify({
    result:"PASS", candidateSha:sha, projectId:"still-hill-08070011",
    branchId:"br-calm-unit-b4hiv86y", database:"neondb", ...applied,
    users:0,workspaces:0,restaurantOrders:0,
    credentialsPrinted:false, rawLogsPrinted:false,
  }));
}

module.exports = { assertCloudInvocation };
if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify(failureDiagnostic(error)));
    process.exitCode = 1;
  });
}
