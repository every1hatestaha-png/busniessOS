import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Client } from "pg";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url);
const registry = require("../../scripts/restaurant-schema-registry.cjs") as {
  discoverTables: (root: string) => string[];
  captureRegistry: (client: Client, tables: string[]) => Promise<unknown>;
  checkRegistry: (url: string) => Promise<void>;
};
// Separate the CLI's intentionally *narrow* Round3 target policy from the
// schema drift tests that also run against other disposable GitHub CI DB names.
// Never relax scripts/restaurant-schema-registry.cjs for a generic test runner.
function safeDisposableDatabaseUrl(): URL {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Schema registry tests require an explicit disposable local DATABASE_URL.");
  let target: URL;
  try { target = new URL(raw); }
  catch { throw new Error("Schema registry tests require a valid disposable local DATABASE_URL."); }
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    !/^\\/munshios_[a-z0-9_]+$/.test(target.pathname) ||
    !["postgresql:", "postgres:"].includes(target.protocol)
  ) {
    throw new Error("Schema registry tests may only inspect disposable local MunshiOS databases.");
  }
  return target;
}

it("rejects managed targets and checks CLI is restricted to Round3 disposable databases", async () => {
  await expect(registry.checkRegistry("postgresql://fixture@production.invalid/munshios_round3"))
    .rejects.toThrow("disposable loopback");
  const local = safeDisposableDatabaseUrl();
  if (/^\\/munshios_round3(?:_[a-z0-9_]+)?$/.test(local.pathname)) {
    await registry.checkRegistry(local.href);
  } else {
    // Other GitHub jobs use their own isolated loopback database names. A
    // rejected CLI target is correct; the following test still compares the
    // actual migrated schema and runs rollback-only drift checks on that DB.
    await expect(registry.checkRegistry(local.href))
      .rejects.toThrow("disposable loopback");
  }
});
it("detects column, constraint, index and trigger drift without persisting fixture DDL", async () => {
  safeDisposableDatabaseUrl(); // Fail closed BEFORE connecting to any DB.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const expected = JSON.parse(readFileSync("docs/architecture/restaurant-schema-registry.json", "utf8"));
  const tables = registry.discoverTables(process.cwd());
  try {
    await client.query("BEGIN");
    expect(await registry.captureRegistry(client, tables)).toEqual(expected);
    for (const sql of [
      'ALTER TABLE restaurant_orders ADD COLUMN round3_drift text',
      'ALTER TABLE restaurant_orders ALTER COLUMN "orderNumber" DROP NOT NULL',
      'ALTER TABLE restaurant_orders ADD CONSTRAINT round3_drift CHECK (total>=0)',
      'CREATE INDEX round3_drift ON restaurant_orders ("workspaceId")',
      'ALTER TABLE restaurant_orders DISABLE TRIGGER USER',
    ]) {
      await client.query("SAVEPOINT drift_fixture");
      await client.query(sql);
      expect(await registry.captureRegistry(client, tables)).not.toEqual(expected);
      await client.query("ROLLBACK TO SAVEPOINT drift_fixture");
    }
    await client.query("SAVEPOINT drift_fixture");
    await client.query("CREATE TABLE restaurant_round3_drift(id int)");
    await expect(registry.captureRegistry(client, tables)).rejects.toThrow("inventory drift");
    await client.query("ROLLBACK TO SAVEPOINT drift_fixture");
    expect(await registry.captureRegistry(client, tables)).toEqual(expected);
  } finally { await client.query("ROLLBACK"); await client.end(); }
});
