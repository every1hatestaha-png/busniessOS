import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createTable: typeof import("@/lib/server/industry-modules")["createRestaurantTable"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let ingestWhatsapp: typeof import("@/lib/server/restaurant-workspace")["ingestWhatsappRestaurantOrder"];
let confirmOrder: typeof import("@/lib/server/restaurant-workspace")["confirmRestaurantOrder"];
let transition: typeof import("@/lib/server/restaurant-workspace")["transitionRestaurantOrder"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let tableA = "";
let tableB = "";
let menuItemId = "";
const owner = () => ({ workspaceId, userId, role: "OWNER" as const });

async function routing(orderId: string) {
  const rows = await db.$queryRaw<Array<{
    fulfillmentType: string;
    restaurantTableId: string | null;
    status: string;
  }>>`
    SELECT "fulfillmentType", "restaurantTableId"::text, "status"
    FROM "restaurant_orders"
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return rows[0]!;
}

describe("restaurant V1.43 routing snapshot", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantTable: createTable } = await import("@/lib/server/industry-modules"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      ingestWhatsappRestaurantOrder: ingestWhatsapp,
      confirmRestaurantOrder: confirmOrder,
      transitionRestaurantOrder: transition,
    } = await import("@/lib/server/restaurant-workspace"));

    const user = await db.user.create({
      data: { clerkId: `v143-${runId}`, email: `v143-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Routing snapshot ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const [a, b] = await Promise.all([
      createTable(owner(), { name: `A-${runId}`, capacity: 4 }),
      createTable(owner(), { name: `B-${runId}`, capacity: 4 }),
    ]);
    tableA = a.id;
    tableB = b.id;

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.43 meal",
        sku: `V143-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createCategory(owner(), { name: `V1.43 ${runId}` });
    const item = await createMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.43 meal",
      price: 200,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    // Test-only teardown: this flow creates committed KDS/WhatsApp history that is immutable in production.
    // Disable user triggers only inside this isolated cleanup transaction.
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await tx.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "workspaceId"=${workspaceId}::uuid`;
      await tx.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
      await tx.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
      await tx.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
      await tx.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
      await tx.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
      await tx.$executeRaw`DELETE FROM "restaurant_tables" WHERE "workspaceId"=${workspaceId}::uuid`;
    });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("allows review-time routing correction before KOT, then freezes table and fulfillment routing", async () => {
    const order = await ingestWhatsapp(workspaceId, {
      externalMessageId: `v143:${randomUUID()}`,
      messageBody: "Dine-in V1.43 meal",
      customerPhone: "+923001234567",
      fulfillmentType: "DINE_IN",
      restaurantTableId: tableA,
      items: [{ menuItemId, quantity: 1 }],
    });
    expect(await routing(order.id)).toMatchObject({
      fulfillmentType: "DINE_IN",
      restaurantTableId: tableA,
      status: "PENDING_REVIEW",
    });

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "restaurantTableId"=${tableB}::uuid
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).resolves.toBe(1);
    expect((await routing(order.id)).restaurantTableId).toBe(tableB);

    await confirmOrder(owner(), order.id);
    const tickets = await db.$queryRaw<Array<{ restaurantTableId: string | null }>>`
      SELECT "restaurantTableId"::text
      FROM "kitchen_tickets"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${order.id}::uuid
    `;
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.restaurantTableId).toBe(tableB);
    const afterConfirm = await routing(order.id);

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "restaurantTableId"=${tableA}::uuid
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant order routing is immutable after kitchen ticket creation");
    expect(await routing(order.id)).toEqual(afterConfirm);

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "fulfillmentType"='TAKEAWAY', "restaurantTableId"=NULL
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant order routing is immutable after kitchen ticket creation");
    expect(await routing(order.id)).toEqual(afterConfirm);

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders"
      SET "fulfillmentType"="fulfillmentType", "restaurantTableId"="restaurantTableId"
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).resolves.toBe(1);

    await transition(owner(), order.id, "PREPARING");
    expect(await routing(order.id)).toMatchObject({
      fulfillmentType: "DINE_IN",
      restaurantTableId: tableB,
      status: "PREPARING",
    });
  }, 60_000);
});
