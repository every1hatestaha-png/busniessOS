import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let createTable: typeof import("@/lib/server/industry-modules")["createRestaurantTable"];
let transfer: typeof import("@/lib/server/restaurant-table-transfer")["transferRestaurantDineInTable"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let orderId = "";
let menuItemId = "";
let tableOne = "";
let tableTwo = "";
let tableThree = "";
const owner = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("Restaurant table transfer in disposable Postgres", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createPosOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ createRestaurantTable: createTable } = await import("@/lib/server/industry-modules"));
    ({ transferRestaurantDineInTable: transfer } = await import("@/lib/server/restaurant-table-transfer"));

    const user = await db.user.create({
      data: { clerkId: `table-transfer-${runId}`, email: `table-transfer-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: { name: `Table Transfer ${runId}`, vertical: "RESTAURANT", members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;
    const category = await createCategory(owner(), { name: "Test Meals" });
    const item = await createMenuItem(owner(), { categoryId: category.id, name: "Dinner Plate", price: 300 });
    menuItemId = item.id;
    const first = await createTable(owner(), { name: "Table One", capacity: 4, area: "Main" });
    const second = await createTable(owner(), { name: "Table Two", capacity: 4, area: "Main" });
    const third = await createTable(owner(), { name: "Table Three", capacity: 4, area: "Terrace" });
    tableOne = first.id; tableTwo = second.id; tableThree = third.id;
    const order = await createPosOrder(owner(), {
      fulfillmentType: "DINE_IN", restaurantTableId: tableOne,
      items: [{ menuItemId, quantity: 1, notes: "No onions" }],
    });
    orderId = order.id;
  }, 60_000);

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.$executeRaw`DELETE FROM "restaurant_inventory_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_tables" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("updates an active order, KOT and both table statuses atomically", async () => {
    const moved = await transfer(owner(), orderId, tableTwo, "Customers requested table two");
    expect(moved).toMatchObject({ moved: true, destination: "Table Two" });
    const [orders, kot, tables, audits] = await Promise.all([
      db.$queryRaw<Array<{ tableId: string }>>`
        SELECT "restaurantTableId"::text AS "tableId" FROM "restaurant_orders"
        WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
      `,
      db.$queryRaw<Array<{ tableId: string }>>`
        SELECT "restaurantTableId"::text AS "tableId" FROM "kitchen_tickets"
        WHERE "restaurantOrderId"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
      `,
      db.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT "id"::text AS "id", "status" FROM "restaurant_tables" WHERE "workspaceId"=${workspaceId}::uuid
      `,
      db.auditLog.findMany({ where: { workspaceId, action: "restaurant.table.transferred" } }),
    ]);
    expect(orders[0]?.tableId).toBe(tableTwo);
    expect(kot.length).toBeGreaterThan(0);
    expect(kot.every(ticket => ticket.tableId === tableTwo)).toBe(true);
    expect(tables.find(table => table.id === tableOne)?.status).toBe("AVAILABLE");
    expect(tables.find(table => table.id === tableTwo)?.status).toBe("OCCUPIED");
    expect(audits).toHaveLength(1);
  });

  it("same destination is idempotent and cannot duplicate audit records", async () => {
    const repeated = await transfer(owner(), orderId, tableTwo, "Same table, retry");
    expect(repeated.moved).toBe(false);
    expect(await db.auditLog.count({ where: { workspaceId, action: "restaurant.table.transferred" } })).toBe(1);
  });

  it("cannot take another occupied table or another tenant's table", async () => {
    const other = await createPosOrder(owner(), {
      fulfillmentType: "DINE_IN", restaurantTableId: tableThree,
      items: [{ menuItemId, quantity: 1 }],
    });
    expect(other.id).toBeTruthy();
    await expect(transfer(owner(), orderId, tableThree, "Try occupied table"))
      .rejects.toThrow("Destination table is unavailable");
    await expect(transfer(owner(), orderId, randomUUID(), "Try foreign table"))
      .rejects.toThrow("not found in this restaurant");
  });

  it("never lets restaurant STAFF move money-linked table assignments", async () => {
    await expect(transfer({ ...owner(), role: "STAFF" }, orderId, tableOne, "Staff request"))
      .rejects.toThrow("Only a restaurant manager");
  });
});
