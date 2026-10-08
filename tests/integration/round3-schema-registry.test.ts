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
it("rejects managed targets before connecting and passes the migrated local contract", async () => {
  await expect(registry.checkRegistry("postgresql://fixture@production.invalid/munshios_round3")).rejects.toThrow("disposable loopback");
  await registry.checkRegistry(process.env.DATABASE_URL!);
});
it("detects column, constraint, index and trigger drift without persisting fixture DDL", async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const expected = JSON.parse(readFileSync("docs/architecture/restaurant-schema-registry.json", "utf8"));
  const tables = registry.discoverTables(process.cwd());
  try {
    await client.query("BEGIN");
    expect(await registry.captureRegistry(client, tables)).toEqual(expected);
    for (const sql of [
      'ALTER TABLE restaurant_orders ADD COLUMN round3_drift text',
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
