import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

let db: typeof import("@/lib/server/db")["db"];
let getWarehouseReconciliation: typeof import("@/lib/server/warehouse-reconciliation")["getWarehouseReconciliation"];
let assertWarehouseReconciled: typeof import("@/lib/server/warehouse-reconciliation")["assertWarehouseReconciled"];
let bootstrapDefaultWarehouseFromCoreStock: typeof import("@/lib/server/warehouse-reconciliation")["bootstrapDefaultWarehouseFromCoreStock"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let defaultWarehouseId = "";
let otherWarehouseId = "";
let productAId = "";
let productBId = "";
let zeroProductId = "";

describe("warehouse reconciliation foundation", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });

    ({ db } = await import("@/lib/server/db"));
    ({
      getWarehouseReconciliation,
      assertWarehouseReconciled,
      bootstrapDefaultWarehouseFromCoreStock,
    } = await import("@/lib/server/warehouse-reconciliation"));

    const user = await db.user.create({
      data: { clerkId: "warehouse-reconcile-" + runId, email: "warehouse-reconcile-" + runId + "@example.invalid" },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: { name: "Warehouse Reconcile " + runId, members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;

    const otherWorkspace = await db.workspace.create({
      data: { name: "Warehouse Other " + runId, members: { create: { userId, role: "OWNER" } } },
    });
    otherWorkspaceId = otherWorkspace.id;

    const [productA, productB, zeroProduct] = await Promise.all([
      db.product.create({
        data: {
          workspaceId,
          name: "Stock A",
          sku: "reconcile-a-" + runId,
          stockQuantity: 10,
          costPrice: 5,
          sellingPrice: 8,
        },
      }),
      db.product.create({
        data: {
          workspaceId,
          name: "Stock B",
          sku: "reconcile-b-" + runId,
          stockQuantity: 2.5,
          costPrice: 20,
          sellingPrice: 30,
        },
      }),
      db.product.create({
        data: {
          workspaceId,
          name: "Zero Stock",
          sku: "reconcile-zero-" + runId,
          stockQuantity: 0,
          costPrice: 1,
          sellingPrice: 2,
        },
      }),
    ]);
    productAId = productA.id;
    productBId = productB.id;
    zeroProductId = zeroProduct.id;

    const defaults = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      workspaceId,
      "Main Warehouse",
      "MAIN-" + runId.slice(0, 8),
    );
    defaultWarehouseId = defaults[0]!.id;

    const otherProduct = await db.product.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "Other Tenant Stock",
        sku: "other-" + runId,
        stockQuantity: 99,
        costPrice: 1,
        sellingPrice: 2,
      },
    });
    const otherWarehouses = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      otherWorkspaceId,
      "Other Warehouse",
      "OTHER-" + runId.slice(0, 8),
    );
    otherWarehouseId = otherWarehouses[0]!.id;
    await db.$executeRawUnsafe(
      'INSERT INTO "warehouse_stocks" ("workspaceId","warehouseId","productId","quantity") VALUES ($1::uuid,$2::uuid,$3::uuid,99)',
      otherWorkspaceId,
      otherWarehouseId,
      otherProduct.id,
    );
  }, 30_000);

  afterAll(async () => {
    if (!db || !userId) return;

    for (const id of [workspaceId, otherWorkspaceId].filter(Boolean)) {
      await db.$executeRawUnsafe('DELETE FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid', id);
      await db.$executeRawUnsafe('DELETE FROM "warehouses" WHERE "workspaceId"=$1::uuid', id);
      await db.product.deleteMany({ where: { workspaceId: id } });
      await db.workspace.delete({ where: { id } });
    }
    await db.user.delete({ where: { id: userId } });
  }, 30_000);

  it("reports location drift before warehouse balances are initialized", async () => {
    const reconciliation = await getWarehouseReconciliation(workspaceId);

    expect(reconciliation.warehouseCount).toBe(1);
    expect(reconciliation.defaultWarehouseId).toBe(defaultWarehouseId);
    expect(reconciliation.warehouseStockRows).toBe(0);
    expect(reconciliation.isReconciled).toBe(false);
    expect(reconciliation.drift).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: productAId, coreQuantity: 10, warehouseQuantity: 0, difference: -10 }),
        expect.objectContaining({ productId: productBId, coreQuantity: 2.5, warehouseQuantity: 0, difference: -2.5 }),
      ]),
    );
    expect(reconciliation.drift.some((row) => row.productId === zeroProductId)).toBe(false);
  });

  it("bootstraps the default warehouse from core stock exactly once", async () => {
    const result = await bootstrapDefaultWarehouseFromCoreStock(workspaceId);
    expect(result).toEqual({ warehouseId: defaultWarehouseId, insertedRows: 2 });

    const reconciliation = await getWarehouseReconciliation(workspaceId);
    expect(reconciliation.isReconciled).toBe(true);
    expect(reconciliation.drift).toEqual([]);
    expect(reconciliation.warehouseStockRows).toBe(2);
    expect(reconciliation.products.find((row) => row.productId === productAId)?.warehouseQuantity).toBe(10);
    expect(reconciliation.products.find((row) => row.productId === productBId)?.warehouseQuantity).toBe(2.5);

    await expect(bootstrapDefaultWarehouseFromCoreStock(workspaceId)).rejects.toMatchObject({
      code: "WAREHOUSE_STOCK_ALREADY_INITIALIZED",
    });
  });

  it("detects drift and refuses to describe a drifted ledger as reconciled", async () => {
    await db.$executeRawUnsafe(
      'UPDATE "warehouse_stocks" SET "quantity"="quantity"+1 WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
      workspaceId,
      defaultWarehouseId,
      productAId,
    );

    const reconciliation = await getWarehouseReconciliation(workspaceId);
    expect(reconciliation.isReconciled).toBe(false);
    expect(reconciliation.drift).toEqual([
      expect.objectContaining({ productId: productAId, coreQuantity: 10, warehouseQuantity: 11, difference: 1 }),
    ]);

    await expect(assertWarehouseReconciled(workspaceId)).rejects.toMatchObject({
      code: "WAREHOUSE_STOCK_DRIFT",
    });
  });

  it("keeps warehouse reconciliation strictly tenant scoped", async () => {
    const other = await getWarehouseReconciliation(otherWorkspaceId);
    expect(other.products).toHaveLength(1);
    expect(other.products[0]).toMatchObject({
      productName: "Other Tenant Stock",
      coreQuantity: 99,
      warehouseQuantity: 99,
      difference: 0,
    });
    expect(other.isReconciled).toBe(true);
  });
});
