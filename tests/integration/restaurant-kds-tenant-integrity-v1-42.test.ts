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
let tableA = "";
let tableB = "";
let menuItemA = "";
const ownerA = () => ({ workspaceId: workspaceA, userId, role: "OWNER" as const });
const ownerB = () => ({ workspaceId: workspaceB, userId, role: "OWNER" as const });

async function ticket(ticketId: string) {
  const rows = await db.$queryRaw<Array<{
    workspaceId: string;
    restaurantOrderId: string | null;
    restaurantTableId: string | null;
    status: string;
  }>>`
    SELECT "workspaceId"::text, "restaurantOrderId"::text, "restaurantTableId"::text, "status"
    FROM "kitchen_tickets"
    WHERE "id"=${ticketId}::uuid
  `;
  return rows[0]!;
}

describe("restaurant V1.42 KDS tenant integrity", () => {
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
      data: { clerkId: `v142-${runId}`, email: `v142-${runId}@example.invalid` },
    });
    userId = user.id;
    const [a, b] = await Promise.all([
      db.workspace.create({
        data: {
          name: `KDS parent A ${runId}`,
          vertical: "LEGACY",
          members: { create: { userId, role: "OWNER" } },
        },
      }),
      db.workspace.create({
        data: {
          name: `KDS parent B ${runId}`,
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

    const [aTable, bTable] = await Promise.all([
      createTable(ownerA(), { name: `A-${runId}`, capacity: 4 }),
      createTable(ownerB(), { name: `B-${runId}`, capacity: 4 }),
    ]);
    tableA = aTable.id;
    tableB = bTable.id;

    const product = await db.product.create({
      data: {
        workspaceId: workspaceA,
        name: "V1.42 meal",
        sku: `V142-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createCategory(ownerA(), { name: `V1.42 ${runId}` });
    const item = await createMenuItem(ownerA(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.42 meal",
      price: 200,
    });
    menuItemA = item.id;
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

  it("keeps the normal confirmation-created KOT tenant-consistent and preserves legacy NULL-order KOTs", async () => {
    const order = await ingestWhatsapp(workspaceA, {
      externalMessageId: `v142:${randomUUID()}`,
      messageBody: "Dine-in V1.42 meal",
      customerPhone: "+923001234567",
      fulfillmentType: "DINE_IN",
      restaurantTableId: tableA,
      items: [{ menuItemId: menuItemA, quantity: 1 }],
    });
    await confirmOrder(ownerA(), order.id);

    const tickets = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text FROM "kitchen_tickets"
      WHERE "workspaceId"=${workspaceA}::uuid AND "restaurantOrderId"=${order.id}::uuid
    `;
    expect(tickets).toHaveLength(1);
    expect(await ticket(tickets[0]!.id)).toMatchObject({
      workspaceId: workspaceA,
      restaurantOrderId: order.id,
      restaurantTableId: tableA,
    });

    const legacy = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "kitchen_tickets" ("workspaceId", "restaurantTableId", "ticketNumber", "notes")
      VALUES (${workspaceA}::uuid, ${tableA}::uuid, ${`LEGACY-${runId}`}, 'legacy compatibility KOT')
      RETURNING "id"::text
    `;
    expect(await ticket(legacy[0]!.id)).toMatchObject({
      workspaceId: workspaceA,
      restaurantOrderId: null,
      restaurantTableId: tableA,
    });
  }, 60_000);

  it("rejects foreign-workspace restaurant order and table parents even for a user who belongs to both workspaces", async () => {
    const foreignOrderNumber = `V142-B-${randomUUID()}`;
    const foreignOrder = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_orders" (
        "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus",
        "subtotal", "discountAmount", "taxAmount", "total"
      ) VALUES (
        ${workspaceB}::uuid, ${foreignOrderNumber}, 'WHATSAPP', 'TAKEAWAY', 'PENDING_REVIEW', 'PAID',
        0, 0, 0, 0
      ) RETURNING "id"::text
    `;

    const local = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "kitchen_tickets" ("workspaceId", "restaurantTableId", "ticketNumber")
      VALUES (${workspaceA}::uuid, ${tableA}::uuid, ${`LOCAL-${runId}`})
      RETURNING "id"::text
    `;
    const localId = local[0]!.id;
    const before = await ticket(localId);

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "restaurantOrderId"=${foreignOrder[0]!.id}::uuid
      WHERE "id"=${localId}::uuid
    `).rejects.toThrow("Restaurant kitchen ticket order must belong to the same workspace");
    expect(await ticket(localId)).toEqual(before);

    await expect(db.$executeRaw`
      UPDATE "kitchen_tickets" SET "restaurantTableId"=${tableB}::uuid
      WHERE "id"=${localId}::uuid
    `).rejects.toThrow("Restaurant kitchen ticket table must belong to the same workspace");
    expect(await ticket(localId)).toEqual(before);

    await expect(db.$executeRaw`
      INSERT INTO "kitchen_tickets" (
        "workspaceId", "restaurantOrderId", "restaurantTableId", "ticketNumber"
      ) VALUES (
        ${workspaceA}::uuid, ${foreignOrder[0]!.id}::uuid, ${tableA}::uuid, ${`FORGED-ORDER-${runId}`}
      )
    `).rejects.toThrow("Restaurant kitchen ticket order must belong to the same workspace");

    await expect(db.$executeRaw`
      INSERT INTO "kitchen_tickets" (
        "workspaceId", "restaurantTableId", "ticketNumber"
      ) VALUES (${workspaceA}::uuid, ${tableB}::uuid, ${`FORGED-TABLE-${runId}`})
    `).rejects.toThrow("Restaurant kitchen ticket table must belong to the same workspace");
  }, 60_000);
});
