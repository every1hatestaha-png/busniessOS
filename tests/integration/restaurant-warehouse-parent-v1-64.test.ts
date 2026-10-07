import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];

const runId = randomUUID();
let workspaceId = "";
let otherWorkspaceId = "";
let warehouseId = "";
let unreferencedWarehouseId = "";
let orderId = "";

describe("restaurant V1.64 Warehouse parent identity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ transitionRestaurantOrderWithIntegrity: transition } = await import("@/lib/server/restaurant-integrity"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createOrder,
    } = await import("@/lib/server/restaurant-workspace"));

    const user = await db.user.create({ data: { clerkId: `v164-${runId}`, email: `v164-${runId}@example.invalid` } });
    const [workspace, otherWorkspace] = await Promise.all([
      db.workspace.create({
        data: { name: `V164 ${runId}`, vertical: "LEGACY", members: { create: { userId: user.id, role: "OWNER" } } },
      }),
      db.workspace.create({ data: { name: `V164 other ${runId}`, vertical: "LEGACY" } }),
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = otherWorkspace.id;
    const context = { workspaceId, userId: user.id, role: "OWNER" as const };

    await db.$executeRaw`INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config") VALUES
      (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb),
      (${workspaceId}::uuid, 'inventory', true, '{"warehouseStockMode":"MANAGED"}'::jsonb)`;

    warehouseId = randomUUID();
    unreferencedWarehouseId = randomUUID();
    await db.$executeRaw`INSERT INTO "warehouses" ("id", "workspaceId", "name", "code", "isDefault") VALUES
      (${warehouseId}::uuid, ${workspaceId}::uuid, 'V164 Default', 'V164-DEFAULT', true),
      (${unreferencedWarehouseId}::uuid, ${workspaceId}::uuid, 'V164 Spare', 'V164-SPARE', false)`;

    const product = await db.product.create({
      data: { workspaceId, name: `V164 product ${runId}`, stockQuantity: 5, costPrice: 10, sellingPrice: 100 },
    });
    await db.$executeRaw`INSERT INTO "warehouse_stocks" ("workspaceId", "warehouseId", "productId", "quantity")
      VALUES (${workspaceId}::uuid, ${warehouseId}::uuid, ${product.id}::uuid, 5)`;

    const category = await createCategory(context, { name: `V164 Menu ${runId}` });
    const menu = await createMenuItem(context, {
      categoryId: category.id,
      productId: product.id,
      name: `V164 item ${runId}`,
      price: 100,
    });
    const order = await createOrder(context, {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId: menu.id, quantity: 1 }],
    });
    orderId = order.id;
    await transition(context, order.id, "PREPARING");
    await transition(context, order.id, "READY");
    await transition(context, order.id, "COMPLETED");
  }, 60_000);

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("records the default Warehouse in immutable Restaurant consumption history", async () => {
    const rows = await db.$queryRaw<Array<{ warehouseId: string | null }>>`
      SELECT "warehouseId"::text AS "warehouseId"
      FROM "restaurant_inventory_consumptions"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.warehouseId).toBe(warehouseId);
  });

  it("rejects workspace, identity and delete mutations for a referenced Warehouse", async () => {
    await expect(db.$executeRaw`UPDATE "warehouses" SET "workspaceId"=${otherWorkspaceId}::uuid WHERE "id"=${warehouseId}::uuid`)
      .rejects.toThrow("Restaurant-linked warehouse identity and workspace are immutable");

    const replacement = randomUUID();
    await expect(db.$executeRaw`UPDATE "warehouses" SET "id"=${replacement}::uuid WHERE "id"=${warehouseId}::uuid`)
      .rejects.toThrow("Restaurant-linked warehouse identity and workspace are immutable");

    await expect(db.$executeRaw`DELETE FROM "warehouses" WHERE "id"=${warehouseId}::uuid`)
      .rejects.toThrow("Restaurant-linked warehouse cannot be deleted");

    const rows = await db.$queryRaw<Array<{ workspaceId: string; name: string }>>`
      SELECT "workspaceId"::text AS "workspaceId", "name"
      FROM "warehouses" WHERE "id"=${warehouseId}::uuid`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.workspaceId).toBe(workspaceId);
  });

  it("allows descriptive/state edits without changing historical Warehouse identity", async () => {
    await db.$executeRaw`UPDATE "warehouses" SET "name"='V164 Archived Default', "isActive"=false WHERE "id"=${warehouseId}::uuid`;
    const rows = await db.$queryRaw<Array<{ name: string; isActive: boolean }>>`
      SELECT "name", "isActive" FROM "warehouses" WHERE "id"=${warehouseId}::uuid`;
    expect(rows).toEqual([{ name: "V164 Archived Default", isActive: false }]);
  });

  it("does not freeze an unreferenced Warehouse", async () => {
    await db.$executeRaw`UPDATE "warehouses" SET "workspaceId"=${otherWorkspaceId}::uuid WHERE "id"=${unreferencedWarehouseId}::uuid`;
    const rows = await db.$queryRaw<Array<{ workspaceId: string }>>`
      SELECT "workspaceId"::text AS "workspaceId" FROM "warehouses" WHERE "id"=${unreferencedWarehouseId}::uuid`;
    expect(rows[0]!.workspaceId).toBe(otherWorkspaceId);
    await db.$executeRaw`DELETE FROM "warehouses" WHERE "id"=${unreferencedWarehouseId}::uuid`;
  });
});
