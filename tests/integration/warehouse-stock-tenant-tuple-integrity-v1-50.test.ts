import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const warehouseA = randomUUID();
const warehouseB = randomUUID();
const productA = randomUUID();
const productB = randomUUID();

async function stockRow(warehouseId: string, productId: string) {
  const rows = await db.$queryRaw<Array<{ workspaceId: string; warehouseId: string; productId: string; quantity: string }>>`
    SELECT "workspaceId"::text, "warehouseId"::text, "productId"::text, "quantity"::text
    FROM "warehouse_stocks"
    WHERE "warehouseId"=${warehouseId}::uuid AND "productId"=${productId}::uuid
  `;
  return rows[0];
}

describe("V1.50 warehouse stock tenant tuple integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));

    await Promise.all([
      db.workspace.create({ data: { id: workspaceA, name: `Warehouse tuple A ${runId}`, vertical: "LEGACY" } }),
      db.workspace.create({ data: { id: workspaceB, name: `Warehouse tuple B ${runId}`, vertical: "LEGACY" } }),
    ]);

    await Promise.all([
      db.product.create({ data: { id: productA, workspaceId: workspaceA, name: `V150-PROD-A-${runId}` } }),
      db.product.create({ data: { id: productB, workspaceId: workspaceB, name: `V150-PROD-B-${runId}` } }),
    ]);

    await db.$executeRaw`
      INSERT INTO "warehouses" ("id", "workspaceId", "name", "code")
      VALUES
        (${warehouseA}::uuid, ${workspaceA}::uuid, ${`V150 Warehouse A ${runId}`}, ${`V150-A-${runId}`}),
        (${warehouseB}::uuid, ${workspaceB}::uuid, ${`V150 Warehouse B ${runId}`}, ${`V150-B-${runId}`})
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "warehouse_stocks" WHERE "warehouseId" IN (${warehouseA}::uuid, ${warehouseB}::uuid)`;
    await db.$executeRaw`DELETE FROM "warehouses" WHERE "id" IN (${warehouseA}::uuid, ${warehouseB}::uuid)`;
    await db.product.deleteMany({ where: { id: { in: [productA, productB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.$disconnect();
  }, 60_000);

  it("allows a warehouse stock row when workspace, warehouse, and product agree", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "warehouse_stocks" ("workspaceId", "warehouseId", "productId", "quantity")
      VALUES (${workspaceA}::uuid, ${warehouseA}::uuid, ${productA}::uuid, 5)
    `).resolves.toBe(1);

    expect(await stockRow(warehouseA, productA)).toEqual({
      workspaceId: workspaceA,
      warehouseId: warehouseA,
      productId: productA,
      quantity: "5.0000",
    });
  }, 60_000);

  it("rejects a forged foreign warehouse on INSERT", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "warehouse_stocks" ("workspaceId", "warehouseId", "productId", "quantity")
      VALUES (${workspaceA}::uuid, ${warehouseB}::uuid, ${productA}::uuid, 1)
    `).rejects.toThrow("Warehouse stock warehouse must belong to the same workspace");

    expect(await stockRow(warehouseB, productA)).toBeUndefined();
  }, 60_000);

  it("rejects a forged foreign product on INSERT", async () => {
    await expect(db.$executeRaw`
      INSERT INTO "warehouse_stocks" ("workspaceId", "warehouseId", "productId", "quantity")
      VALUES (${workspaceA}::uuid, ${warehouseA}::uuid, ${productB}::uuid, 1)
    `).rejects.toThrow("Warehouse stock product must belong to the same workspace");

    expect(await stockRow(warehouseA, productB)).toBeUndefined();
  }, 60_000);

  it("rejects changing a valid row to a foreign warehouse and preserves the original tuple", async () => {
    await expect(db.$executeRaw`
      UPDATE "warehouse_stocks"
      SET "warehouseId"=${warehouseB}::uuid
      WHERE "warehouseId"=${warehouseA}::uuid AND "productId"=${productA}::uuid
    `).rejects.toThrow("Warehouse stock warehouse must belong to the same workspace");

    expect(await stockRow(warehouseA, productA)).toMatchObject({ workspaceId: workspaceA, warehouseId: warehouseA, productId: productA });
  }, 60_000);

  it("rejects changing a valid row to a foreign product and preserves the original tuple", async () => {
    await expect(db.$executeRaw`
      UPDATE "warehouse_stocks"
      SET "productId"=${productB}::uuid
      WHERE "warehouseId"=${warehouseA}::uuid AND "productId"=${productA}::uuid
    `).rejects.toThrow("Warehouse stock product must belong to the same workspace");

    expect(await stockRow(warehouseA, productA)).toMatchObject({ workspaceId: workspaceA, warehouseId: warehouseA, productId: productA });
  }, 60_000);

  it("rejects moving the row workspace while retaining its warehouse and product", async () => {
    await expect(db.$executeRaw`
      UPDATE "warehouse_stocks"
      SET "workspaceId"=${workspaceB}::uuid
      WHERE "warehouseId"=${warehouseA}::uuid AND "productId"=${productA}::uuid
    `).rejects.toThrow("Warehouse stock warehouse must belong to the same workspace");

    expect(await stockRow(warehouseA, productA)).toMatchObject({ workspaceId: workspaceA, warehouseId: warehouseA, productId: productA });
  }, 60_000);
});
