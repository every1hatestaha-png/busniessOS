import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const require = createRequire(import.meta.url);
const { expectedMigrationCatalog, migrateEmptyDatabase, runPrismaSubprocess, failureDiagnostic } = require("../../scripts/run-sterile-staging-migrations.cjs");
const { assertSterileSchema } = require("../../scripts/sterile-schema-attestation.cjs");
let client: Client;

describe.skipIf(process.env.RUN_STERILE_REHEARSAL !== "true")("fresh disposable PG18 migration runner rehearsal", () => {
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (target.protocol !== "postgresql:" || target.hostname !== "127.0.0.1" || !["/munshios_sterile_rehearsal", "/munshios_sterile_rehearsal_v2"].includes(target.pathname)) {
      throw new Error("Rehearsal accepts only the new disposable loopback database.");
    }
    client = new Client({ connectionString: target.toString() });
    await client.connect();
  });
  afterAll(async () => { if (client) await client.end(); });

  it("applies exactly 132 once, checks checksums/order/schema, 72 empty tables and three seeded plans", async () => {
    let calls = 0;
    const result = await migrateEmptyDatabase(client, expectedMigrationCatalog(), () => {
      calls++;
      return runPrismaSubprocess({ cliPath: resolve("node_modules/prisma/build/index.js") });
    });
    expect(calls).toBe(1);
    expect(result).toMatchObject({ migrations: 132, tables: 74, emptyApplicationTables: 72, migrationSeededPlans: 3 });
    expect((await client.query('SELECT count(*)::int AS total, count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)::int AS failed FROM _prisma_migrations')).rows[0]).toEqual({ total: 132, failed: 0 });
    await expect(migrateEmptyDatabase(client, expectedMigrationCatalog(), () => { calls++; })).rejects.toMatchObject({ diagnostic: { stage: "empty_schema", reason: "not_empty_or_wrong_server" } });
    expect(calls).toBe(1);
  }, 180000);

  it("rejects a simultaneous operator before executing a child", async () => {
    const other = new Client({ connectionString: process.env.DATABASE_URL });
    await other.connect();
    await client.query("SELECT pg_advisory_lock(132, 20261010)");
    try {
      await expect(migrateEmptyDatabase(other, expectedMigrationCatalog(), () => { throw new Error("must not run"); })).rejects.toMatchObject({ diagnostic: { stage: "advisory_lock", reason: "operator_busy" } });
    } finally { await client.query("SELECT pg_advisory_unlock(132, 20261010)"); await other.end(); }
  });

  it("reproduces a Prisma permission failure after valid connectivity/empty PG18 preflight, leaving no ledger", async () => {
    await client.query("CREATE DATABASE munshios_sterile_diagnostics_denied");
    await client.query("CREATE ROLE sterile_migration_readonly LOGIN PASSWORD 'synthetic-local-only'");
    const adminTarget = new URL(process.env.DATABASE_URL!);
    adminTarget.pathname = "/munshios_sterile_diagnostics_denied";
    const admin = new Client({ connectionString: adminTarget.toString() });
    await admin.connect();
    const restrictedTarget = new URL(adminTarget);
    restrictedTarget.username = "sterile_migration_readonly";
    restrictedTarget.password = "synthetic-local-only";
    const restricted = new Client({ connectionString: restrictedTarget.toString() });
    try {
      await admin.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
      await restricted.connect();
      let out;
      try {
        await migrateEmptyDatabase(restricted, expectedMigrationCatalog(), () => runPrismaSubprocess({ env: { ...process.env, DATABASE_URL: restrictedTarget.toString() } }));
        throw new Error("Restricted migration must fail");
      } catch (error) { out = failureDiagnostic(error); }
      expect(out).toMatchObject({ result: "FAIL", stage: "prisma_subprocess", reason: "nonzero_exit", retryAllowed: false });
      expect((await admin.query("SELECT count(*)::int AS objects FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].objects).toBe(0);
      expect((await admin.query("SELECT to_regclass('public._prisma_migrations') IS NULL AS absent")).rows[0].absent).toBe(true);
      console.log(JSON.stringify({ disposableOnly: true, permissionFailure: out }));
    } finally { await restricted.end(); await admin.end(); }
  }, 180000);

  it("detects real index/constraint drift and data without persisting disposable mutations", async () => {
    for (const sql of [
      'DROP INDEX "sales_orders_workspaceId_orderDate_id_idx"',
      'ALTER TABLE workspace_members DROP CONSTRAINT workspace_members_restaurant_station_check',
      'CREATE VIEW unexpected_view AS SELECT 1 AS id',
      "UPDATE saas_plans SET name='Unreviewed' WHERE code='starter'",
      `INSERT INTO auth_recovery_buckets ("emailHash", "windowStartedAt", attempts) VALUES ('${"a".repeat(64)}', now(), 1)`,
    ]) {
      await client.query("BEGIN");
      try { await client.query(sql); await expect(assertSterileSchema(client)).rejects.toThrow(); }
      finally { await client.query("ROLLBACK"); }
    }
    expect(await assertSterileSchema(client)).toMatchObject({ tables: 74, emptyApplicationTables: 72 });
  });
});
