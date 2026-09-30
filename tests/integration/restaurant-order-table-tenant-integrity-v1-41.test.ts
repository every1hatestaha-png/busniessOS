import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createTable: typeof import("@/lib/server/industry-modules")["createRestaurantTable"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let ingestWhatsapp: typeof import("@/lib/server/restaurant-workspace")["ingestWhatsappRestaurantOrder"];
let confirmOrder: typeof import("@/lib/server/restaurant-workspace")["confirmRestaurantOrder"];

const runId = randomUUID();
let userId = "";
let workspaceA = "";
let workspaceB = "";
let tableA1 = "";
let tableA2 = "";
let tableB = "";
let menuItemId = "";
const ownerA = () => ({ workspaceId: workspaceA, userId, role: "OWNER" as const });
const ownerB = () => ({ workspaceId: workspaceB, userId, role: "OWNER" as const });

async function orderTable(orderId: string) {
  const rows = await db.$queryRaw<Array<{ restaurantTableId: string | null; status: string }>>`
    SELECT "restaurantTableId", "status"
    FROM "restaurant_orders"
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceA}::uuid
  `;
  return rows[0]!;
}

describe("restaurant V1.41 order table tenant integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantTable: createTable } = await import("@/lib/server/industry-modules"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      ingestWhatsappRestaurantOrder: ingestWhatsapp,
      confirmRestaurantOrder: confirmOrder,
    } = await import("@/lib/server/restaurant-workspace"));

    const user = await db.user.create({
      data: { clerkId: `v141-${runId}`, email: `v141-${runId}@example.invalid` },
    });
    userId = user.id;
    const [a, b] = await Promise.all([
      db.workspace.create({
        data: {
          name: `Table parent A ${runId}`,
          vertical: "LEGACY",
          members: { create: { userId, role: "OWNER" } },
        },
      }),
      db.workspace.create({
        data: {
          name: `Table parent B ${runId}`,
          vertical: "LEGACY",
          members: { create: { userId, role: "OWNER" } },
        },
      }),
    ]);
    workspaceA = a.id;
    workspaceB = b.id;

    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES
        (${workspaceA}::uuid, 'restaurant', true, '{}'::jsonb, now()),
        (${workspaceB}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const [a1, a2, b1] = await Promise.all([
      createTable(ownerA(), { name: `A1-${runId}`, capacity: 4 }),
      createTable(ownerA(), { name: `A2-${runId}`, capacity: 4 }),
      createTable(ownerB(), { name: `B1-${runId}`, capacity: 4 }),
    ]);
    tableA1 = a1.id;
    tableA2 = a2.id;
    tableB = b1.id;

    const product = await db.product.create({
      data: {
        workspaceId: workspaceA,
        name: "V1.41 meal",
        sku: `V141-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createCategory(ownerA(), { name: `V1.41 ${runId}` });
    const item = await createMenuItem(ownerA(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.41 meal",
      price: 200,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_tables" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.product.deleteMany({ where: { workspaceId: workspaceA } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.auditLog.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("rejects cross-workspace table parents on UPDATE while allowing a same-workspace reassignment", async () => {
    const order = await ingestWhatsapp(workspaceA, {
      externalMessageId: `v141:${randomUUID()}`,
      messageBody: "Dine-in V1.41 meal",
      customerPhone: "+923001234567",
      fulfillmentType: "DINE_IN",
      restaurantTableId: tableA1,
      items: [{ menuItemId, quantity: 1 }],
    });
    expect(await orderTable(order.id)).toMatchObject({ restaurantTableId: tableA1, status: "PENDING_REVIEW" });

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "restaurantTableId"=${tableA2}::uuid
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceA}::uuid
    `).resolves.toBe(1);
    expect((await orderTable(order.id)).restaurantTableId).toBe(tableA2);

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "restaurantTableId"=${tableB}::uuid
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceA}::uuid
    `).rejects.toThrow("Restaurant order table must belong to the same workspace");
    expect((await orderTable(order.id)).restaurantTableId).toBe(tableA2);

    await confirmOrder(ownerA(), order.id);
    expect(await orderTable(order.id)).toMatchObject({ restaurantTableId: tableA2, status: "CONFIRMED" });
    const tickets = await db.$queryRaw<Array<{ restaurantTableId: string | null }>>`
      SELECT "restaurantTableId"
      FROM "kitchen_tickets"
      WHERE "workspaceId"=${workspaceA}::uuid AND "restaurantOrderId"=${order.id}::uuid
    `;
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.restaurantTableId).toBe(tableA2);
  }, 60_000);

  it("rejects a forged INSERT that links a workspace-A order to workspace-B table", async () => {
    const forgedNumber = `V141-FORGED-${randomUUID()}`;
    await expect(db.$executeRaw`
      INSERT INTO "restaurant_orders" (
        "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus",
        "restaurantTableId", "subtotal", "discountAmount", "taxAmount", "total"
      ) VALUES (
        ${workspaceA}::uuid, ${forgedNumber}, 'WHATSAPP', 'DINE_IN', 'PENDING_REVIEW', 'PAID',
        ${tableB}::uuid, 0, 0, 0, 0
      )
    `).rejects.toThrow("Restaurant order table must belong to the same workspace");

    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_orders"
      WHERE "workspaceId"=${workspaceA}::uuid AND "orderNumber"=${forgedNumber}
    `;
    expect(rows[0]?.count).toBe(0);
  }, 60_000);
});
