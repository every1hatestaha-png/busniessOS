import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

let db: typeof import("@/lib/server/db")["db"];
let applyManagedWarehouseStockDelta: typeof import("@/lib/server/managed-warehouse-stock")["applyManagedWarehouseStockDelta"];
let getWarehouseStockMode: typeof import("@/lib/server/managed-warehouse-stock")["getWarehouseStockMode"];
let getManagedWarehouseReadiness: typeof import("@/lib/server/managed-warehouse-stock")["getManagedWarehouseReadiness"];
let setWorkspaceModule: typeof import("@/lib/server/industry-modules")["setWorkspaceModule"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let warehouseId = "";
let otherWarehouseId = "";
let productId = "";
let otherProductId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("managed warehouse stock primitive", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });

    ({ db } = await import("@/lib/server/db"));
    ({ applyManagedWarehouseStockDelta, getWarehouseStockMode, getManagedWarehouseReadiness } = await import("@/lib/server/managed-warehouse-stock"));
    ({ setWorkspaceModule } = await import("@/lib/server/industry-modules"));

    const user = await db.user.create({
      data: { clerkId: "managed-warehouse-" + runId, email: "managed-warehouse-" + runId + "@example.invalid" },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: { name: "Managed Warehouse " + runId, members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;

    const otherWorkspace = await db.workspace.create({
      data: { name: "Managed Warehouse Other " + runId, members: { create: { userId, role: "OWNER" } } },
    });
    otherWorkspaceId = otherWorkspace.id;

    await setWorkspaceModule(context(), "inventory", true, {});

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "Managed Stock Product",
        sku: "managed-" + runId,
        stockQuantity: 0,
        costPrice: 10,
        sellingPrice: 20,
      },
    });
    productId = product.id;

    const otherProduct = await db.product.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "Other Managed Product",
        sku: "managed-other-" + runId,
        stockQuantity: 0,
        costPrice: 10,
        sellingPrice: 20,
      },
    });
    otherProductId = otherProduct.id;

    const warehouses = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      workspaceId,
      "Main Warehouse",
      "MNG-" + runId.slice(0, 8),
    );
    warehouseId = warehouses[0]!.id;

    const otherWarehouses = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      otherWorkspaceId,
      "Other Warehouse",
      "MNGO-" + runId.slice(0, 8),
    );
    otherWarehouseId = otherWarehouses[0]!.id;
  }, 30_000);

  afterAll(async () => {
    if (!db || !userId) return;
    for (const id of [workspaceId, otherWorkspaceId].filter(Boolean)) {
      await db.$executeRawUnsafe('DELETE FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid', id);
      await db.$executeRawUnsafe('DELETE FROM "warehouses" WHERE "workspaceId"=$1::uuid', id);
      await db.$executeRawUnsafe('DELETE FROM "workspace_modules" WHERE "workspaceId"=$1::uuid', id);
      await db.product.deleteMany({ where: { workspaceId: id } });
      await db.workspace.delete({ where: { id } });
    }
    await db.user.delete({ where: { id: userId } });
  }, 30_000);

  it("keeps legacy mode as a strict no-op", async () => {
    expect(await getWarehouseStockMode(workspaceId)).toBe("LEGACY");

    const result = await db.$transaction((tx) =>
      applyManagedWarehouseStockDelta(tx, {
        workspaceId,
        productId,
        delta: 5,
      }),
    );

    expect(result).toEqual({ applied: false, mode: "LEGACY" });

    const rows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT count(*)::bigint AS "count" FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid',
      workspaceId,
    );
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });

  it("reports readiness independently from activation", async () => {
    const readiness = await getManagedWarehouseReadiness(workspaceId);
    expect(readiness.ready).toBe(true);
    expect(readiness.reconciliation.defaultWarehouseId).toBe(warehouseId);
    expect(readiness.reconciliation.isReconciled).toBe(true);
  });

  it("requires an explicit same-tenant active warehouse in managed mode", async () => {
    await setWorkspaceModule(context(), "inventory", true, { warehouseStockMode: "MANAGED" });
    expect(await getWarehouseStockMode(workspaceId)).toBe("MANAGED");

    await expect(
      db.$transaction((tx) =>
        applyManagedWarehouseStockDelta(tx, { workspaceId, productId, delta: 1 }),
      ),
    ).rejects.toMatchObject({ code: "WAREHOUSE_REQUIRED" });

    await expect(
      db.$transaction((tx) =>
        applyManagedWarehouseStockDelta(tx, { workspaceId, warehouseId: otherWarehouseId, productId, delta: 1 }),
      ),
    ).rejects.toMatchObject({ code: "WAREHOUSE_NOT_FOUND" });

    await expect(
      db.$transaction((tx) =>
        applyManagedWarehouseStockDelta(tx, { workspaceId, warehouseId, productId: otherProductId, delta: 1 }),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("applies increments and decrements atomically without allowing negative location stock", async () => {
    const first = await db.$transaction((tx) =>
      applyManagedWarehouseStockDelta(tx, { workspaceId, warehouseId, productId, delta: 5 }),
    );
    expect(first).toMatchObject({ applied: true, mode: "MANAGED", previousQuantity: 0, nextQuantity: 5 });

    const second = await db.$transaction((tx) =>
      applyManagedWarehouseStockDelta(tx, { workspaceId, warehouseId, productId, delta: -2 }),
    );
    expect(second).toMatchObject({ applied: true, previousQuantity: 5, nextQuantity: 3 });

    await expect(
      db.$transaction((tx) =>
        applyManagedWarehouseStockDelta(tx, { workspaceId, warehouseId, productId, delta: -4 }),
      ),
    ).rejects.toMatchObject({ code: "NEGATIVE_WAREHOUSE_STOCK" });

    const balance = await db.$queryRawUnsafe<Array<{ quantity: string }>>(
      'SELECT "quantity"::text AS "quantity" FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
      workspaceId,
      warehouseId,
      productId,
    );
    expect(Number(balance[0]?.quantity)).toBe(3);
  });
});
