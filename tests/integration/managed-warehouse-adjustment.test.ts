import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

import { createTestWorkspace, getDb, teardownTestWorkspace } from "../finance-grade/helpers/db-helpers";

let db: Awaited<ReturnType<typeof getDb>>;
let adjustProductStock: typeof import("@/lib/server/products")["adjustProductStock"];
let setWorkspaceModule: typeof import("@/lib/server/industry-modules")["setWorkspaceModule"];

let workspaceId = "";
let userId = "";
let otherWorkspaceId = "";
let otherUserId = "";
let productId = "";
let warehouseId = "";
let otherWarehouseId = "";
const marker = randomUUID();
const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function quantities() {
  const product = await db.product.findFirstOrThrow({
    where: { id: productId, workspaceId },
    select: { stockQuantity: true },
  });
  const rows = await db.$queryRawUnsafe<Array<{ quantity: string }>>(
    'SELECT "quantity"::text AS "quantity" FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
    workspaceId,
    warehouseId,
    productId,
  );
  return { core: Number(product.stockQuantity), warehouse: Number(rows[0]?.quantity ?? 0) };
}

describe("managed warehouse stock adjustments", () => {
  beforeAll(async () => {
    db = await getDb();
    ({ adjustProductStock } = await import("@/lib/server/products"));
    ({ setWorkspaceModule } = await import("@/lib/server/industry-modules"));

    const primary = await createTestWorkspace("warehouse-adjustment-" + marker);
    workspaceId = primary.workspaceId;
    userId = primary.userId;

    const other = await createTestWorkspace("warehouse-adjustment-other-" + marker);
    otherWorkspaceId = other.workspaceId;
    otherUserId = other.userId;

    await setWorkspaceModule(context(), "inventory", true, { warehouseStockMode: "MANAGED" });

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "Adjustment Product",
        sku: "ADJ-" + marker,
        stockQuantity: 10,
        costPrice: 100,
        sellingPrice: 150,
        status: "ACTIVE",
      },
    });
    productId = product.id;

    const warehouses = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      workspaceId,
      "Adjustment Warehouse",
      "ADJ-" + marker.slice(0, 8),
    );
    warehouseId = warehouses[0]!.id;

    const otherWarehouses = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      otherWorkspaceId,
      "Other Warehouse",
      "OTHER-" + marker.slice(0, 8),
    );
    otherWarehouseId = otherWarehouses[0]!.id;

    await db.$executeRawUnsafe(
      'INSERT INTO "warehouse_stocks" ("workspaceId","warehouseId","productId","quantity","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,10,now())',
      workspaceId,
      warehouseId,
      productId,
    );
  }, 30_000);

  afterAll(async () => {
    if (workspaceId) await teardownTestWorkspace(workspaceId, userId);
    if (otherWorkspaceId) await teardownTestWorkspace(otherWorkspaceId, otherUserId);
  }, 30_000);

  it("adds and removes stock atomically in the selected warehouse", async () => {
    expect(await quantities()).toEqual({ core: 10, warehouse: 10 });

    const afterAdd = await adjustProductStock(context(), productId, 4, "Cycle count add", warehouseId);
    expect(afterAdd).toBe(14);
    expect(await quantities()).toEqual({ core: 14, warehouse: 14 });

    const afterRemove = await adjustProductStock(context(), productId, -3, "Damaged stock", warehouseId);
    expect(afterRemove).toBe(11);
    expect(await quantities()).toEqual({ core: 11, warehouse: 11 });
  });

  it("rejects missing and cross-tenant warehouses without partial stock changes", async () => {
    const before = await quantities();

    await expect(
      adjustProductStock(context(), productId, 1, "Missing warehouse", undefined),
    ).rejects.toThrow();

    await expect(
      adjustProductStock(context(), productId, 1, "Cross tenant warehouse", otherWarehouseId),
    ).rejects.toThrow();

    expect(await quantities()).toEqual(before);
  });

  it("rolls back core stock when selected warehouse cannot satisfy a removal", async () => {
    await db.$executeRawUnsafe(
      'UPDATE "warehouse_stocks" SET "quantity"=1, "updatedAt"=now() WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
      workspaceId,
      warehouseId,
      productId,
    );
    const productBefore = await db.product.findFirstOrThrow({
      where: { id: productId, workspaceId },
      select: { stockQuantity: true },
    });

    await expect(
      adjustProductStock(context(), productId, -2, "Warehouse shortage", warehouseId),
    ).rejects.toThrow();

    const productAfter = await db.product.findFirstOrThrow({
      where: { id: productId, workspaceId },
      select: { stockQuantity: true },
    });
    expect(Number(productAfter.stockQuantity)).toBe(Number(productBefore.stockQuantity));

    await db.$executeRawUnsafe(
      'UPDATE "warehouse_stocks" SET "quantity"=$4, "updatedAt"=now() WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
      workspaceId,
      warehouseId,
      productId,
      Number(productAfter.stockQuantity),
    );
    expect(await quantities()).toEqual({
      core: Number(productAfter.stockQuantity),
      warehouse: Number(productAfter.stockQuantity),
    });
  });
});
