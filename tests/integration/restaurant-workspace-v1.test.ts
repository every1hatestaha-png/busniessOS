import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let ingestWhatsappRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["ingestWhatsappRestaurantOrder"];
let confirmRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["confirmRestaurantOrder"];
let setRestaurantMenuItemAvailability: typeof import("@/lib/server/restaurant-workspace")["setRestaurantMenuItemAvailability"];

const runId = randomUUID();
let userA = "";
let userB = "";
let workspaceA = "";
let workspaceB = "";
let itemA = "";
let itemB = "";

const contextA = () => ({ workspaceId: workspaceA, role: "OWNER" as const, userId: userA });
const contextB = () => ({ workspaceId: workspaceB, role: "OWNER" as const, userId: userB });

async function enableRestaurant(workspaceId: string) {
  await db.$executeRaw`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    ON CONFLICT ("workspaceId", "moduleKey") DO UPDATE SET "enabled"=true, "updatedAt"=now()
  `;
}

async function cleanupWorkspace(workspaceId: string) {
  // Test-only teardown: production keeps WhatsApp intake evidence append-only.
  // Bypass user triggers only inside this isolated cleanup transaction.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
    await tx.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "workspaceId"=${workspaceId}::uuid`;
  });
  await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
  await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.auditLog.deleteMany({ where: { workspaceId } });
}

describe("restaurant workspace v1 integrity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantMenuCategory,
      createRestaurantMenuItem,
      createPosRestaurantOrder,
      ingestWhatsappRestaurantOrder,
      confirmRestaurantOrder,
      setRestaurantMenuItemAvailability,
    } = await import("@/lib/server/restaurant-workspace"));

    const [a, b] = await Promise.all([
      db.user.create({ data: { clerkId: `restaurant-a-${runId}`, email: `restaurant-a-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `restaurant-b-${runId}`, email: `restaurant-b-${runId}@example.invalid` } }),
    ]);
    userA = a.id;
    userB = b.id;
    const [wa, wb] = await Promise.all([
      db.workspace.create({ data: { name: `Restaurant A ${runId}`, vertical: "LEGACY", members: { create: { userId: userA, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `Restaurant B ${runId}`, vertical: "LEGACY", members: { create: { userId: userB, role: "OWNER" } } } }),
    ]);
    workspaceA = wa.id;
    workspaceB = wb.id;
    await Promise.all([enableRestaurant(workspaceA), enableRestaurant(workspaceB)]);

    const [categoryA, categoryB] = await Promise.all([
      createRestaurantMenuCategory(contextA(), { name: "Burgers" }),
      createRestaurantMenuCategory(contextB(), { name: "Pizza" }),
    ]);
    const [menuA, menuB] = await Promise.all([
      createRestaurantMenuItem(contextA(), { categoryId: categoryA.id, name: "Zinger", price: 650 }),
      createRestaurantMenuItem(contextB(), { categoryId: categoryB.id, name: "Pepperoni", price: 1800 }),
    ]);
    itemA = menuA.id;
    itemB = menuB.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await cleanupWorkspace(workspaceA);
    await cleanupWorkspace(workspaceB);
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await db.$disconnect();
  }, 60_000);

  it("uses persisted tenant menu prices and creates a single kitchen ticket for POS", async () => {
    const order = await createPosRestaurantOrder(contextA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId: itemA, quantity: 2 }],
    });
    expect(order.status).toBe("CONFIRMED");
    expect(order.total).toBe(1300);

    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "kitchen_tickets"
      WHERE "workspaceId"=${workspaceA}::uuid AND "restaurantOrderId"=${order.id}::uuid
    `;
    expect(rows[0]?.count).toBe(1);
  });

  it("stages WhatsApp intake without a KOT and is idempotent until staff confirmation", async () => {
    const messageId = `wamid-${runId}`;
    const input = {
      externalMessageId: messageId,
      messageBody: "1 zinger takeaway",
      customerPhone: "+923001234567",
      customerName: "Test Customer",
      fulfillmentType: "TAKEAWAY" as const,
      items: [{ menuItemId: itemA, quantity: 1 }],
    };
    const first = await ingestWhatsappRestaurantOrder(workspaceA, input);
    expect(first.status).toBe("PENDING_REVIEW");
    expect(first.idempotent).toBe(false);

    const beforeConfirm = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "kitchen_tickets"
      WHERE "workspaceId"=${workspaceA}::uuid AND "restaurantOrderId"=${first.id}::uuid
    `;
    expect(beforeConfirm[0]?.count).toBe(0);

    const duplicate = await ingestWhatsappRestaurantOrder(workspaceA, input);
    expect(duplicate.id).toBe(first.id);
    expect(duplicate.idempotent).toBe(true);

    await confirmRestaurantOrder(contextA(), first.id);
    await confirmRestaurantOrder(contextA(), first.id);
    const afterConfirm = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "kitchen_tickets"
      WHERE "workspaceId"=${workspaceA}::uuid AND "restaurantOrderId"=${first.id}::uuid
    `;
    expect(afterConfirm[0]?.count).toBe(1);
  });

  it("rejects a menu item that belongs to another workspace", async () => {
    await expect(createPosRestaurantOrder(contextA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId: itemB, quantity: 1 }],
    })).rejects.toThrow("not available in this workspace");
  });

  it("rejects unavailable menu items before an order is created", async () => {
    await setRestaurantMenuItemAvailability(contextA(), itemA, false);
    await expect(createPosRestaurantOrder(contextA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId: itemA, quantity: 1 }],
    })).rejects.toThrow("currently unavailable");
    await setRestaurantMenuItemAvailability(contextA(), itemA, true);
  });
});
