import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { assertSterileMigrationTarget, assertZeroPublicTables, expectedMigrationCatalog, assertAppliedHistory, assertPrivateExecution, migrateEmptyDatabase } =
  require("../../scripts/run-sterile-staging-migrations.cjs");
const env = {
  STERILE_MIGRATIONS_APPROVED: "I_APPROVE_NEW_STERILE_DATABASE_ONLY",
  NEON_PROJECT_ID: "still-hill-08070011",
  NEON_BRANCH_ID: "br-calm-unit-b4hiv86y",
  DATABASE_URL: "postgresql://fixture:synthetic-secret@ep-cool-recipe-b4i2kgez.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require",
  VERCEL: undefined, CI: undefined,
};

describe("opt-in fresh Neon staging migration preflight", () => {
  it("accepts only the exact reviewed empty nonproduction target", () => {
    expect(assertSterileMigrationTarget(env)).toEqual({
      projectId: "still-hill-08070011", branchId: "br-calm-unit-b4hiv86y", database: "neondb",
    });
    expect(expectedMigrationCatalog()).toHaveLength(132);
    expect(() => assertZeroPublicTables([])).not.toThrow();
  });
  it.each([
    { CI: "true" }, { VERCEL: "1" },
    { STERILE_MIGRATIONS_APPROVED: "" }, { NEON_PROJECT_ID: "wandering-moon-51932710" },
    { NEON_BRANCH_ID: "br-delicate-credit-b5lttgnc" },
    { DATABASE_URL: "invalid" },
    { DATABASE_URL: env.DATABASE_URL.replace("ep-cool-recipe-b4i2kgez", "ep-fragrant-heart-b578tydw") },
    { DATABASE_URL: env.DATABASE_URL.replace("/neondb", "/other") },
    { DATABASE_URL: env.DATABASE_URL.replace("sslmode=require", "sslmode=disable") },
    { DATABASE_URL: env.DATABASE_URL + "&host=another-host" },
    { DATABASE_URL: env.DATABASE_URL + "&options=-csearch_path%3Dother" },
  ])("rejects unauthorized project, role, URL or invocation: %j", overrides => {
    expect(() => assertSterileMigrationTarget({ ...env, ...overrides })).toThrow();
  });
  it("rejects any existing tables including Prisma ledger", () => {
    expect(() => assertZeroPublicTables(["_prisma_migrations"])).toThrow();
    expect(() => assertZeroPublicTables(["users", "workspaces"])).toThrow();
    expect(() => assertZeroPublicTables(null)).toThrow();
  });
  it("never includes credentials in its returned identity", () => {
    expect(JSON.stringify(assertSterileMigrationTarget(env))).not.toContain("synthetic-secret");
  });
  it.each(["&sslmode=disable", "&sslmode=require", "&SSLMODE=disable", "&ssl=false", "&sslcert=local", "&schema=public&schema=private", "&channel_binding=disable", "#fragment"])("rejects contradictory/unreviewed URL option %s", suffix => {
    expect(() => assertSterileMigrationTarget({ ...env, DATABASE_URL: env.DATABASE_URL + suffix })).toThrow();
  });
  it.each(["PGOPTIONS", "NODE_DEBUG", "NODE_TLS_REJECT_UNAUTHORIZED", "PRISMA_SCHEMA_ENGINE_BINARY"])("rejects inherited execution override %s before connecting", key => {
    expect(() => assertPrivateExecution({ [key]: "unsafe", STERILE_CANDIDATE_SHA: "a".repeat(40) })).toThrow("overrides");
  });
  it("requires an explicit exact SHA and rejects a different checkout", () => {
    expect(() => assertPrivateExecution({})).toThrow("SHA");
    expect(() => assertPrivateExecution({ STERILE_CANDIDATE_SHA: "a".repeat(40) })).toThrow("reviewed commit");
  });
  it("validates all checksums and rejects pending, duplicate and out-of-order execution", async () => {
    const fs = await import("node:fs");
    const crypto = await import("node:crypto");
    const names: string[] = expectedMigrationCatalog();
    const rows = names.map((migration_name, i) => ({ migration_name, checksum: crypto.createHash("sha256").update(fs.readFileSync(`prisma/migrations/${migration_name}/migration.sql`)).digest("hex"), started_at: new Date(i * 2000), finished_at: new Date(i * 2000 + 1000), rolled_back_at: null, applied_steps_count: 1 }));
    expect(() => assertAppliedHistory(names, rows)).not.toThrow();
    for (const changed of [{ checksum: "tampered" }, { finished_at: null }, { rolled_back_at: new Date() }, { applied_steps_count: 0 }, { started_at: rows[1].started_at }]) {
      expect(() => assertAppliedHistory(names, [{ ...rows[0], ...changed }, ...rows.slice(1)])).toThrow();
    }
    expect(() => assertAppliedHistory(names, [...rows, rows[0]])).toThrow();
    expect(() => assertAppliedHistory(names, rows.slice(1))).toThrow();
  });
  it("refuses a concurrent operator before preflight or child execution", async () => {
    let calls = 0;
    const client = { query: async () => { calls++; return { rows: [{ acquired: false }] }; } };
    await expect(migrateEmptyDatabase(client, [], () => { throw new Error("must not run"); })).rejects.toThrow("operator");
    expect(calls).toBe(1);
  });
  it("reports fixed, credential-free stage names for a denied lock", async () => {
    const stages: string[] = [];
    const client = { query: async () => ({ rows: [{ acquired: false }] }) };
    await expect(migrateEmptyDatabase(client, [], () => { throw new Error("never execute"); }, (s: string) => stages.push(s)))
      .rejects.toThrow("operator");
    expect(stages).toEqual(["ADVISORY_LOCK"]);
    expect(JSON.stringify(stages)).not.toMatch(/postgresql|secret|password/i);
  });
  it("reports exact safe stage if Prisma child fails, without printing raw child output", async () => {
    const stages: string[] = [];
    const client = { query: async (sql: string) => (
      sql.includes("pg_try_advisory_lock") ? { rows: [{ acquired: true }] }
      : { rows: [{ major: 18, recovering: false, objects: 0, types: 0, routines: 0, extra_schemas: 0 }] }
    ) };
    await expect(migrateEmptyDatabase(client, expectedMigrationCatalog(),
      () => ({ status: 1, stderr: "postgresql://secret:password@host/private" }),
      (s: string) => stages.push(s))).rejects.toThrow("failed or timed out");
    expect(stages).toEqual(["ADVISORY_LOCK", "EMPTY_SCHEMA_PRECHECK", "MIGRATION_FILE_PRECHECK", "PRISMA_MIGRATE_DEPLOY"]);
    expect(JSON.stringify(stages)).not.toMatch(/postgresql|secret|password/i);
  });

  it("fails closed after child error/timeout without reconciling or authorizing release", async () => {
    for (const failure of [{ status: 1 }, { status: null, error: new Error("private") }]) {
      const queries: string[] = [];
      const client = { query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
        return { rows: [{ major: 18, recovering: false, objects: 0, types: 0, routines: 0, extra_schemas: 0 }] };
      } };
      await expect(migrateEmptyDatabase(client, expectedMigrationCatalog(), () => failure)).rejects.toThrow("failed or timed out");
      expect(queries.some(q => q.includes("_prisma_migrations"))).toBe(false);
      expect(queries.at(-1)).toContain("pg_advisory_unlock");
    }
  });
});
