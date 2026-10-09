import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { assertSterileMigrationTarget, assertZeroPublicTables, expectedMigrationCatalog } =
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
});
