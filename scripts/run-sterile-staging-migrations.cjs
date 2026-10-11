/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Opt-in, operator-only migration for a newly created EMPTY nonproduction Neon
 * project. Not invoked by Vercel, CI or ordinary builds. Never logs DB URLs.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const target = require("../config/preview-acceptance-targets.json");
const root = path.resolve(__dirname, "..");
const { hasSafeNeonUrlOptions } = require("./safe-neon-url-options.cjs");
const { assertEmptyDatabase, assertSterileSchema } = require("./sterile-schema-attestation.cjs");

const REQUIRED_APPROVAL = "I_APPROVE_NEW_STERILE_DATABASE_ONLY";

// Only fixed classifications can leave the private process. Never serialize an
// Error, message, stack, SQL, path, URL, stdout, stderr or arbitrary provider code.
const safeSystemCodes = new Set(["ENOENT", "EACCES", "EPERM", "ENOBUFS", "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "28P01", "3D000", "42501", "53300", "57P03", "55P03"]);
const safePrismaCodes = new Set(["P1000", "P1001", "P1002", "P1003", "P1008", "P1010", "P1011", "P1012", "P1013", "P1015", "P1017", "P3000", "P3001", "P3002", "P3003", "P3004", "P3005", "P3006", "P3007", "P3008", "P3009", "P3010", "P3011", "P3012", "P3013", "P3014", "P3015", "P3016", "P3017", "P3018", "P3019", "P3020", "P3021", "P3022"]);
const safeSignals = new Set(["SIGTERM", "SIGKILL", "SIGABRT", "SIGINT", "SIGSEGV"]);
class StageFailure extends Error {
  constructor(stage, reason, fields = {}) {
    super(`${stage} failed (${reason}); stop without retry.`);
    this.diagnostic = { stage, reason, ...fields };
  }
}
function systemCode(error) { return safeSystemCodes.has(error?.code) ? error.code : undefined; }
async function atStage(stage, action, reason = "check_failed") {
  try { return await action(); }
  catch (error) {
    if (error instanceof StageFailure) throw error;
    throw new StageFailure(stage, reason, { ...(systemCode(error) ? { systemCode: systemCode(error) } : {}) });
  }
}
function failureDiagnostic(error) {
  return { result: "FAIL", ...(error instanceof StageFailure ? error.diagnostic : { stage: "internal", reason: "unclassified_failure" }), platform: process.platform, retryAllowed: false, credentialsPrinted: false, rawLogsPrinted: false };
}
async function withCleanup(action, cleanup) {
  let primary;
  try { return await action(); }
  catch (error) { primary = error; throw error; }
  finally {
    try { await atStage("cleanup", cleanup, "cleanup_failed"); }
    catch (error) {
      if (!primary) throw error;
      if (primary instanceof StageFailure) primary.diagnostic.cleanupFailed = true;
    }
  }
}

// Direct Node executable + argv works on Windows without npm.cmd, shell quoting
// or credential arguments. Drain streams while keeping the pg lock session live;
// keep only fixed Error: Pxxxx classifications, never the raw child output.
function runPrismaSubprocess({ cliPath = path.join(root, "node_modules/prisma/build/index.js"), cwd = root, env = process.env, executable = process.execPath, timeoutMs = 180000, outputLimitBytes = 16 * 1024 * 1024, signal } = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    let child, timer, bytes = 0, prismaCode, errorCode, timedOut = false, outputLimitExceeded = false, cancelled = false, terminationFailed = false, streamFailed = false;
    const tails = { stdout: "", stderr: "" };
    try {
      child = spawn(executable, [cliPath, "migrate", "deploy"], { cwd, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) { resolve({ status: null, launchFailed: true, systemCode: systemCode(error), elapsedMs: Date.now() - started }); return; }
    const terminate = () => {
      try { if (!child.kill("SIGKILL")) terminationFailed = true; }
      catch { terminationFailed = true; }
      if (terminationFailed) {
        child.stdout.destroy(); child.stderr.destroy(); child.unref(); finish(null, undefined);
      }
    };
    const cancel = () => { cancelled = true; terminate(); };
    const consume = stream => chunk => {
      bytes += chunk.length;
      const text = tails[stream] + chunk.toString("utf8");
      for (const match of text.matchAll(/(?:^|\n)\s*Error:\s*(P\d{4})(?=\s|$)/g)) {
        if (safePrismaCodes.has(match[1])) prismaCode ??= match[1];
      }
      tails[stream] = text.slice(-32);
      if (bytes > outputLimitBytes && !outputLimitExceeded) { outputLimitExceeded = true; terminate(); }
    };
    child.stdout.on("data", consume("stdout"));
    child.stderr.on("data", consume("stderr"));
    child.stdout.on("error", () => { streamFailed = true; terminate(); });
    child.stderr.on("error", () => { streamFailed = true; terminate(); });
    child.on("error", error => { errorCode = systemCode(error); });
    timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    let settled = false;
    const finish = (status, childSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      resolve({ status, signal: safeSignals.has(childSignal) ? childSignal : undefined, launchFailed: errorCode !== undefined || child.pid === undefined, systemCode: errorCode, timedOut, outputLimitExceeded, cancelled, terminationFailed, streamFailed, prismaCode, elapsedMs: Date.now() - started });
    };
    child.on("close", finish);
    child.on("exit", (status, childSignal) => {
      // Descendants may retain inherited pipes after a killed Windows CLI.
      // Do not wait forever for pipe closure or claim its engines are stopped.
      if (timedOut || outputLimitExceeded || cancelled || streamFailed) {
        child.stdout.destroy(); child.stderr.destroy(); finish(status, childSignal);
      }
    });
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}
function assertPrismaResult(result) {
  if (result && !result.error && !result.launchFailed && !result.timedOut && !result.outputLimitExceeded && !result.cancelled && !result.terminationFailed && !result.streamFailed && result.status === 0) return;
  const code = safeSystemCodes.has(result?.systemCode) ? result.systemCode : systemCode(result?.error);
  const reason = result?.timedOut || code === "ETIMEDOUT" ? "timeout"
    : result?.outputLimitExceeded || code === "ENOBUFS" ? "output_limit"
    : result?.cancelled ? "cancelled" : result?.streamFailed ? "output_stream_failed" : result?.launchFailed || result?.error ? "launch_failed" : "nonzero_exit";
  throw new StageFailure("prisma_subprocess", reason, {
    ...(code ? { systemCode: code } : {}),
    ...(safePrismaCodes.has(result?.prismaCode) ? { prismaCode: result.prismaCode } : {}),
    ...(Number.isInteger(result?.status) && result.status >= -2147483648 && result.status <= 4294967295 ? { exitCode: result.status } : {}),
    ...(safeSignals.has(result?.signal) ? { signal: result.signal } : {}),
    ...(Number.isInteger(result?.elapsedMs) && result.elapsedMs >= 0 && result.elapsedMs <= 2147483647 ? { elapsedMs: result.elapsedMs } : {}),
    ...(result?.terminationFailed ? { terminationFailed: true } : {}),
    migrationMayHaveStarted: !result?.launchFailed,
    verifyNoActiveMigrationProcess: true,
  });
}

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

async function migrateEmptyDatabase(client, names, migrate) {
  await atStage("advisory_lock", async () => {
    const lock = (await client.query("SELECT pg_try_advisory_lock(132, 20261010) AS acquired")).rows[0];
    if (!lock?.acquired) throw new StageFailure("advisory_lock", "operator_busy");
  });
  return withCleanup(async () => {
    await atStage("empty_schema", () => assertEmptyDatabase(client), "not_empty_or_wrong_server");
    const hashes = () => names.map(name => createHash("sha256").update(fs.readFileSync(path.join(root,"prisma/migrations",name,"migration.sql"))).digest("hex"));
    const before = await atStage("migration_catalog", hashes);
    await atStage("prisma_subprocess", async () => assertPrismaResult(await migrate()), "subprocess_exception");
    await atStage("migration_catalog", () => {
      if (hashes().some((hash,i) => hash !== before[i])) throw new Error("Files changed");
    }, "files_changed_during_execution");
    await atStage("post_migration_attestation", () => client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"), "snapshot_failed");
    return withCleanup(async () => {
      await atStage("post_migration_attestation", async () => {
        const applied = await client.query('SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count FROM public._prisma_migrations ORDER BY migration_name');
        assertAppliedHistory(names, applied.rows);
      }, "ledger_or_checksum_failed");
      const schema = await atStage("post_migration_attestation", () => assertSterileSchema(client), "schema_or_seed_data_failed");
      return { migrations: names.length, ...schema };
    }, () => client.query("ROLLBACK"));
  }, () => client.query("SELECT pg_advisory_unlock(132, 20261010)"));
}

async function main() {
  const identity = await atStage("local_validation", () => assertSterileMigrationTarget(process.env), "target_or_approval_rejected");
  await atStage("local_validation", () => assertPrivateExecution(process.env), "private_checkout_rejected");
  const names = await atStage("local_validation", expectedMigrationCatalog, "migration_catalog_rejected");
  const prisma = path.join(root, "node_modules/prisma/build/index.js");
  await atStage("local_validation", () => { if (!fs.existsSync(prisma)) throw new Error("CLI missing"); }, "prisma_cli_missing");
  // Prisma config already enforces verify-full; use the same TLS policy for pg.
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("sslmode", "verify-full");
  const client = await atStage("db_connection", () => {
    const { Client } = require("pg");
    return new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000, query_timeout: 30000 });
  }, "driver_initialization_failed");
  // Idle session failures must be handled while the async child runs; never let
  // node-postgres emit a raw URL/driver stack as an unhandled EventEmitter error.
  let sessionFailed = false;
  const controller = new AbortController();
  client.on("error", () => { sessionFailed = true; controller.abort(); });
  const result = await withCleanup(async () => {
    await atStage("db_connection", () => client.connect(), "connection_failed");
    await atStage("db_connection", async () => {
      if ((await client.query("SELECT current_database() AS name")).rows[0]?.name !== identity.database) throw new Error("Identity mismatch");
    }, "database_identity_failed");
    const result = await migrateEmptyDatabase(client, names, async () => {
      if (sessionFailed) throw new StageFailure("advisory_lock", "session_lost_before_subprocess");
      const result = await runPrismaSubprocess({ signal: controller.signal });
      if (sessionFailed) throw new StageFailure("advisory_lock", "session_lost_during_subprocess", { migrationMayHaveStarted: true, verifyNoActiveMigrationProcess: true });
      assertPrismaResult(result);
      return result;
    });
    return result;
  }, () => client.end());
  console.log(JSON.stringify({ result: "PASS", ...identity, ...result, users: 0, workspaces: 0, restaurantOrders: 0, credentialsPrinted: false }));
}

module.exports = { assertSterileMigrationTarget, assertZeroPublicTables, expectedMigrationCatalog, assertAppliedHistory, assertPrivateExecution, migrateEmptyDatabase, atStage, failureDiagnostic, runPrismaSubprocess, assertPrismaResult };
if (require.main === module) main().catch(error => {
  console.error(JSON.stringify(failureDiagnostic(error)));
  process.exitCode = 1;
});
