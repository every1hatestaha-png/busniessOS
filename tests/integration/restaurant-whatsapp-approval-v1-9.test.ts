import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let ingestWhatsappRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["ingestWhatsappRestaurantOrder"];
let confirmRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["confirmRestaurantOrder"];

const runId = randomUUID();
let workspaceId = "";
let ownerId = "";
let managerId = "";
let staffId = "";
let menuItemId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId: ownerId });
const manager = () => ({ workspaceId, role: "MANAGER" as const, userId: managerId });
const staff = () => ({ workspaceId, role: "STAFF" as const, userId: staffId });

describe("restaurant V1.9 WhatsApp discount approval boundary", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, ingestWhatsappRestaurantOrder, confirmRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));

    const [ownerUser, managerUser, staffUser] = await Promise.all([
      db.user.create({ data: { clerkId: `wa-owner-${runId}`, email: `wa-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `wa-manager-${runId}`, email: `wa-manager-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `wa-staff-${runId}`, email: `wa-staff-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    managerId = managerUser.id;
    staffId = staffUser.id;

    const workspace = await db.workspace.create({
      data: {
        name: `WhatsApp Approval ${runId}`,
        vertical: "LEGACY",
        members: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: managerId, role: "MANAGER" },
            { userId: staffId, role: "STAFF" },
          ],
        },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const product = await db.product.create({ data: { workspaceId, name: "WhatsApp Meal", sku: `WA-${runId}`, stockQuantity: 10, costPrice: 100, sellingPrice: 500 } });
    const category = await createRestaurantMenuCategory(owner(), { name: "WhatsApp Menu" });
    const menuItem = await createRestaurantMenuItem(owner(), { categoryId: category.id, productId: product.id, name: "WhatsApp Meal", price: 500 });
    menuItemId = menuItem.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.product.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, managerId, staffId] } } });
    await db.$disconnect();
  }, 60_000);

  it("blocks staff from confirming a discounted WhatsApp order but allows a manager", async () => {
    const order = await ingestWhatsappRestaurantOrder(workspaceId, {
      externalMessageId: `wa-discount-${runId}`,
      messageBody: "One meal, requested discount",
      customerPhone: "+923001234567",
      customerName: "Discount Customer",
      fulfillmentType: "TAKEAWAY",
      discountAmount: 100,
      items: [{ menuItemId, quantity: 1 }],
    });

    await expect(confirmRestaurantOrder(staff(), order.id))
      .rejects.toThrow("Manager approval is required to confirm a discounted WhatsApp order");

    let rows = await db.$queryRaw<Array<{ status: string; confirmedById: string | null }>>`
      SELECT "status", "confirmedById"::text AS "confirmedById" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ status: "PENDING_REVIEW", confirmedById: null });
    expect(await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "kitchen_tickets" WHERE "restaurantOrderId"=${order.id}::uuid
    `).resolves.toMatchObject([{ count: 0 }]);

    await confirmRestaurantOrder(manager(), order.id);
    rows = await db.$queryRaw<Array<{ status: string; confirmedById: string | null }>>`
      SELECT "status", "confirmedById"::text AS "confirmedById" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ status: "CONFIRMED", confirmedById: managerId });
    const tickets = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "kitchen_tickets" WHERE "restaurantOrderId"=${order.id}::uuid
    `;
    expect(tickets[0]?.count).toBe(1);
  });

  it("still allows staff confirmation when the WhatsApp order has no discount", async () => {
    const order = await ingestWhatsappRestaurantOrder(workspaceId, {
      externalMessageId: `wa-normal-${runId}`,
      messageBody: "One regular meal",
      customerPhone: "+923007654321",
      customerName: "Regular Customer",
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });

    await confirmRestaurantOrder(staff(), order.id);
    const rows = await db.$queryRaw<Array<{ status: string; confirmedById: string | null }>>`
      SELECT "status", "confirmedById"::text AS "confirmedById" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ status: "CONFIRMED", confirmedById: staffId });
  });
});
