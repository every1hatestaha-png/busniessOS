import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let ingestWhatsapp: typeof import("@/lib/server/restaurant-workspace")["ingestWhatsappRestaurantOrder"];
let confirmOrder: typeof import("@/lib/server/restaurant-workspace")["confirmRestaurantOrder"];
let transition: typeof import("@/lib/server/restaurant-workspace")["transitionRestaurantOrder"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let menuItemId = "";
const actor = () => ({ workspaceId, userId, role: "OWNER" as const });

async function identity(orderId: string) {
  const rows = await db.$queryRaw<Array<{
    orderNumber: string;
    source: string;
    externalReference: string | null;
    createdAt: Date;
    status: string;
  }>>`
    SELECT "orderNumber", "source", "externalReference", "createdAt", "status"
    FROM "restaurant_orders"
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return rows[0]!;
}

describe("restaurant V1.40 order identity snapshot", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createPosOrder,
      ingestWhatsappRestaurantOrder: ingestWhatsapp,
      confirmRestaurantOrder: confirmOrder,
      transitionRestaurantOrder: transition,
    } = await import("@/lib/server/restaurant-workspace"));

    const user = await db.user.create({
      data: { clerkId: `v140-${runId}`, email: `v140-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Order identity ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.40 meal",
        sku: `V140-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createCategory(actor(), { name: `V1.40 ${runId}` });
    const item = await createMenuItem(actor(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.40 meal",
      price: 200,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.product.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("freezes POS order number, channel, external reference and creation chronology", async () => {
    const order = await createPosOrder(actor(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const before = await identity(order.id);
    expect(before).toMatchObject({ source: "POS", externalReference: null, status: "CONFIRMED" });

    const attempts = [
      db.$executeRaw`UPDATE "restaurant_orders" SET "orderNumber"=${`FORGED-${runId}`} WHERE "id"=${order.id}::uuid`,
      db.$executeRaw`UPDATE "restaurant_orders" SET "source"='MANUAL' WHERE "id"=${order.id}::uuid`,
      db.$executeRaw`UPDATE "restaurant_orders" SET "externalReference"=${`forged:${runId}`} WHERE "id"=${order.id}::uuid`,
      db.$executeRaw`UPDATE "restaurant_orders" SET "createdAt"="createdAt" + interval '1 hour' WHERE "id"=${order.id}::uuid`,
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toThrow("Restaurant order identity snapshot is immutable");
      expect(await identity(order.id)).toEqual(before);
    }

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders"
      SET "orderNumber"="orderNumber", "source"="source", "externalReference"="externalReference", "createdAt"="createdAt"
      WHERE "id"=${order.id}::uuid
    `).resolves.toBe(1);
    expect(await identity(order.id)).toEqual(before);

    await transition(actor(), order.id, "PREPARING");
    expect((await identity(order.id)).status).toBe("PREPARING");
  }, 60_000);

  it("preserves WhatsApp external-reference idempotency after attempted identity rewrites", async () => {
    const externalMessageId = `v140:${randomUUID()}`;
    const input = {
      externalMessageId,
      messageBody: "One V1.40 meal",
      customerPhone: "+923001234567",
      fulfillmentType: "TAKEAWAY" as const,
      items: [{ menuItemId, quantity: 1 }],
    };
    const first = await ingestWhatsapp(workspaceId, input);
    const before = await identity(first.id);
    expect(before).toMatchObject({
      source: "WHATSAPP",
      externalReference: externalMessageId,
      status: "PENDING_REVIEW",
    });

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "externalReference"=${`rewritten:${randomUUID()}`}
      WHERE "id"=${first.id}::uuid
    `).rejects.toThrow("Restaurant order identity snapshot is immutable");
    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "externalReference"=NULL
      WHERE "id"=${first.id}::uuid
    `).rejects.toThrow("Restaurant order identity snapshot is immutable");
    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "source"='MANUAL'
      WHERE "id"=${first.id}::uuid
    `).rejects.toThrow("Restaurant order identity snapshot is immutable");
    expect(await identity(first.id)).toEqual(before);

    const retry = await ingestWhatsapp(workspaceId, input);
    expect(retry).toMatchObject({ id: first.id, idempotent: true });
    expect(await identity(first.id)).toEqual(before);

    await confirmOrder(actor(), first.id);
    await transition(actor(), first.id, "PREPARING");
    const progressed = await identity(first.id);
    expect(progressed).toMatchObject({
      source: "WHATSAPP",
      externalReference: externalMessageId,
      status: "PREPARING",
    });
    expect(progressed.orderNumber).toBe(before.orderNumber);
    expect(progressed.createdAt).toEqual(before.createdAt);
  }, 60_000);
});
