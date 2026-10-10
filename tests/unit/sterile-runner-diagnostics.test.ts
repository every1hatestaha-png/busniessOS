import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { atStage, failureDiagnostic, assertPrismaResult, runPrismaSubprocess, migrateEmptyDatabase, expectedMigrationCatalog } = require("../../scripts/run-sterile-staging-migrations.cjs");
const fixture = mkdtempSync(join(tmpdir(), "sterile private cli "));
afterAll(() => rmSync(fixture, { recursive: true, force: true }));
const privateText = "postgresql://fixture:never-log-this-password@private.example/neondb SQL PRIVATE";
function cli(name: string, code: string) {
  const file = join(fixture, `${name} fixture.cjs`);
  writeFileSync(file, code);
  return file;
}
function emptyClient(fail?: string) {
  const queries: string[] = [];
  return { queries, query: async (sql: string) => {
    queries.push(sql);
    if (fail && sql.includes(fail)) throw Object.assign(new Error(privateText), { code: "42501", detail: privateText });
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
    if (sql.includes("server_version_num")) return { rows: [{ major: 18, recovering: false, objects: 0, types: 0, routines: 0, extra_schemas: 0 }] };
    return { rows: [] };
  } };
}
async function diagnostic(action: () => unknown) {
  try { await action(); throw new Error("expected failure"); }
  catch (error) {
    const result = failureDiagnostic(error);
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("postgresql");
    expect(JSON.stringify(result)).not.toContain("SQL PRIVATE");
    expect(result).toMatchObject({ result: "FAIL", retryAllowed: false, credentialsPrinted: false, rawLogsPrinted: false });
    return result;
  }
}

describe("sanitized sterile runner diagnostics", () => {
  it.each(["local_validation", "db_connection", "advisory_lock", "empty_schema", "prisma_subprocess", "post_migration_attestation", "cleanup"])("reports %s without private Error details", async stage => {
    expect(await diagnostic(() => atStage(stage, () => { throw Object.assign(new Error(privateText), { code: "ECONNRESET", stack: privateText }); }))).toMatchObject({ stage, systemCode: "ECONNRESET" });
  });
  it("does not serialize arbitrary or forged errors", () => {
    expect(failureDiagnostic({ diagnostic: { stage: privateText }, message: privateText })).toMatchObject({ stage: "internal", reason: "unclassified_failure" });
  });
  it.each([
    [{ status: null, error: { code: "ETIMEDOUT", message: privateText } }, "timeout", "ETIMEDOUT"],
    [{ status: null, error: { code: "ENOBUFS", message: privateText } }, "output_limit", "ENOBUFS"],
    [{ status: null, launchFailed: true, systemCode: "ENOENT" }, "launch_failed", "ENOENT"],
    [{ status: 1, prismaCode: "P1011" }, "nonzero_exit", undefined],
    [{ status: 3221225781 }, "nonzero_exit", undefined],
    [{ status: 1, prismaCode: privateText, systemCode: privateText, stderr: privateText }, "nonzero_exit", undefined],
  ])("classifies subprocess termination without raw output %#", async (result, reason, code) => {
    const out = await diagnostic(() => assertPrismaResult(result));
    expect(out).toMatchObject({ stage: "prisma_subprocess", reason, verifyNoActiveMigrationProcess: true });
    expect(out.systemCode).toBe(code);
    if ("prismaCode" in result && result.prismaCode === "P1011") expect(out.prismaCode).toBe("P1011");
  });
  it("does not accept exit 1 from deploy even if migrate status might also return 1", async () => {
    expect(await diagnostic(() => assertPrismaResult({ status: 1 }))).toMatchObject({ stage: "prisma_subprocess", reason: "nonzero_exit", exitCode: 1 });
  });
  it("distinguishes lock-query and empty-schema failures before child execution", async () => {
    for (const [sql, stage] of [["pg_try_advisory_lock", "advisory_lock"], ["server_version_num", "empty_schema"]]) {
      let calls = 0;
      expect(await diagnostic(() => migrateEmptyDatabase(emptyClient(sql), expectedMigrationCatalog(), () => { calls++; }))).toMatchObject({ stage, systemCode: "42501" });
      expect(calls).toBe(0);
    }
  });
  it("preserves the Prisma failure when lock release also fails", async () => {
    const client = emptyClient("pg_advisory_unlock");
    expect(await diagnostic(() => migrateEmptyDatabase(client, expectedMigrationCatalog(), () => ({ status: 1, prismaCode: "P1001" })))).toMatchObject({ stage: "prisma_subprocess", prismaCode: "P1001", cleanupFailed: true });
    expect(client.queries.some(q => q.includes("_prisma_migrations"))).toBe(false);
  });
  it("classifies a missing migration file before launching Prisma", async () => {
    let calls = 0;
    expect(await diagnostic(() => migrateEmptyDatabase(emptyClient(), ["missing-reviewed-file"], () => { calls++; }))).toMatchObject({ stage: "migration_catalog", systemCode: "ENOENT" });
    expect(calls).toBe(0);
  });
  it("distinguishes post-migration ledger failure and still rolls back/releases", async () => {
    const client = emptyClient();
    expect(await diagnostic(() => migrateEmptyDatabase(client, expectedMigrationCatalog(), () => ({ status: 0 })))).toMatchObject({ stage: "post_migration_attestation", reason: "ledger_or_checksum_failed" });
    expect(client.queries.slice(-2)).toEqual(["ROLLBACK", "SELECT pg_advisory_unlock(132, 20261010)"]);
  });
  it("preserves attestation failure when transaction rollback also fails", async () => {
    const client = emptyClient("ROLLBACK");
    expect(await diagnostic(() => migrateEmptyDatabase(client, expectedMigrationCatalog(), () => ({ status: 0 })))).toMatchObject({ stage: "post_migration_attestation", cleanupFailed: true });
  });
  it("preserves ledger failure when final unlock also fails", async () => {
    const client = emptyClient("pg_advisory_unlock");
    expect(await diagnostic(() => migrateEmptyDatabase(client, expectedMigrationCatalog(), () => ({ status: 0 })))).toMatchObject({ stage: "post_migration_attestation", cleanupFailed: true });
  });
  it("CLI entrypoint emits one JSON diagnostic and never tries the database after local rejection", () => {
    const result = spawnSync(process.execPath, ["scripts/run-sterile-staging-migrations.cjs"], { env: { ...process.env, DATABASE_URL: privateText, STERILE_MIGRATIONS_APPROVED: "" }, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ stage: "local_validation", reason: "target_or_approval_rejected", retryAllowed: false });
    expect(result.stderr).not.toContain(privateText);
  });
});

describe("real direct Node subprocess on Windows/Linux", () => {
  it("preserves paths with spaces, exact deploy argv and private env without a shell", async () => {
    const argsFile = join(fixture, "arguments.json");
    const file = cli("arguments", `require('node:fs').writeFileSync(${JSON.stringify(argsFile)},JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),secretPresent:!!process.env.STERILE_TEST_SECRET}));`);
    const result = await runPrismaSubprocess({ cliPath: file, cwd: fixture, env: { ...process.env, STERILE_TEST_SECRET: privateText } });
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(argsFile, "utf8"))).toEqual({ args: ["migrate", "deploy"], cwd: fixture, secretPresent: true });
    expect(JSON.stringify(result)).not.toContain(privateText);
  });
  it.each(["P1001", "P1011", "P3005"])("retains only allowlisted %s from secret-bearing child stderr", async code => {
    const file = cli(code, `process.stderr.write('Error: ${code}\\n'+process.env.STERILE_TEST_SECRET);process.exitCode=1;`);
    const result = await runPrismaSubprocess({ cliPath: file, env: { ...process.env, STERILE_TEST_SECRET: privateText } });
    expect(result).toMatchObject({ status: 1, prismaCode: code });
    expect(await diagnostic(() => assertPrismaResult(result))).toMatchObject({ stage: "prisma_subprocess", prismaCode: code });
    expect(result).not.toHaveProperty("stderr");
    expect(result).not.toHaveProperty("stdout");
  });
  it("reproduces legacy spawnSync ENOBUFS and drains the same child successfully", async () => {
    const file = cli("large-output", `process.stdout.write('x'.repeat(2*1024*1024),()=>process.exit(0));`);
    const legacy = spawnSync(process.execPath, [file, "migrate", "deploy"], { encoding: "utf8", timeout: 5000 });
    expect((legacy.error as NodeJS.ErrnoException | undefined)?.code).toBe("ENOBUFS");
    const result = await runPrismaSubprocess({ cliPath: file });
    expect(result).toMatchObject({ status: 0, outputLimitExceeded: false, timedOut: false });
    expect(result).not.toHaveProperty("stdout");
  });
  it("classifies a real timeout without retry or raw logs", async () => {
    const file = cli("timeout", "setInterval(()=>{},1000);");
    const result = await runPrismaSubprocess({ cliPath: file, timeoutMs: 250 });
    expect(await diagnostic(() => assertPrismaResult(result))).toMatchObject({ stage: "prisma_subprocess", reason: "timeout" });
  });
  it("stops the child when the owning lock session aborts", async () => {
    const file = cli("abort", "setInterval(()=>{},1000);");
    const controller = new AbortController();
    const running = runPrismaSubprocess({ cliPath: file, signal: controller.signal });
    controller.abort();
    expect(await diagnostic(() => running.then(assertPrismaResult))).toMatchObject({ stage: "prisma_subprocess", reason: "cancelled", verifyNoActiveMigrationProcess: true });
  });
  it("bounds excessive streamed output", async () => {
    const file = cli("limit", "setInterval(()=>process.stdout.write('x'.repeat(65536)),1);");
    const result = await runPrismaSubprocess({ cliPath: file, outputLimitBytes: 1024 });
    expect(await diagnostic(() => assertPrismaResult(result))).toMatchObject({ stage: "prisma_subprocess", reason: "output_limit" });
  });
  it("classifies missing executable without serializing its path", async () => {
    const result = await runPrismaSubprocess({ executable: join(fixture, "missing.exe") });
    expect(await diagnostic(() => assertPrismaResult(result))).toMatchObject({ stage: "prisma_subprocess", reason: "launch_failed", systemCode: "ENOENT", migrationMayHaveStarted: false });
  });
});
