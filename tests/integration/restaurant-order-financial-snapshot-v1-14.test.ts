import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let ingestWhatsappRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["ingestWhatsappRestaurantOrder"];
let transitionRestaurantOrderWithIntegrity: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let menuItemId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

async function complete(orderId: string) {
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "PREPARING");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "READY");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "COMPLETED");
}

describe("restaurant V1.14 financial snapshot immutability", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantMenuCategory,
      createRestaurantMenuItem,
      createPosRestaurantOrder,
      ingestWhatsappRestaurantOrder,
    } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity } = await import("@/lib/server/restaurant-integrity"));

    const user = await db.user.create({
      data: { clerkId: `snapshot-${runId}`, email: `snapshot-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Restaurant Snapshot ${runId}`,
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
        name: "Snapshot Meal",
        sku: `SNAP-${runId}`,
        stockQuantity: 50,
        costPrice: 80,
        sellingPrice: 500,
      },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: "Snapshot Menu" });
    const item = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "Snapshot Meal",
      price: 500,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "restaurant_return_payment_allocations" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_return_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_returns" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_inventory_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("blocks direct financial changes on a POS order while allowing lifecycle progress", async () => {
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders"
      SET "total"=1, "updatedAt"=now()
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant order financial snapshot is immutable after creation");

    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "PREPARING");
    const rows = await db.$queryRaw<Array<{ status: string; subtotal: unknown; total: unknown }>>`
      SELECT "status", "subtotal", "total"
      FROM "restaurant_orders"
      WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]?.status).toBe("PREPARING");
    expect(Number(rows[0]?.subtotal)).toBe(500);
    expect(Number(rows[0]?.total)).toBe(500);
  });

  it("prevents a pending WhatsApp order from bypassing review by mutating only total", async () => {
    const order = await ingestWhatsappRestaurantOrder(workspaceId, {
      externalMessageId: `snapshot-wa-${runId}`,
      messageBody: "One Snapshot Meal",
      customerPhone: "+923001111111",
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders"
      SET "total"=100, "updatedAt"=now()
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant order financial snapshot is immutable after creation");

    const rows = await db.$queryRaw<Array<{ status: string; discountAmount: unknown; taxAmount: unknown; total: unknown }>>`
      SELECT "status", "discountAmount", "taxAmount", "total"
      FROM "restaurant_orders"
      WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]?.status).toBe("PENDING_REVIEW");
    expect(Number(rows[0]?.discountAmount)).toBe(0);
    expect(Number(rows[0]?.taxAmount)).toBe(0);
    expect(Number(rows[0]?.total)).toBe(500);
  });

  it("keeps a completed order financial snapshot aligned with its existing ledger", async () => {
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    await complete(order.id);

    const ledgerBefore = await db.generalLedgerEntry.count({ where: { workspaceId } });
    await expect(db.$executeRaw`
      UPDATE "restaurant_orders"
      SET "subtotal"=700, "taxAmount"=50, "total"=750, "updatedAt"=now()
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant order financial snapshot is immutable after creation");
    const ledgerAfter = await db.generalLedgerEntry.count({ where: { workspaceId } });

    const rows = await db.$queryRaw<Array<{ status: string; subtotal: unknown; taxAmount: unknown; total: unknown; accountingPostedAt: Date | null }>>`
      SELECT "status", "subtotal", "taxAmount", "total", "accountingPostedAt"
      FROM "restaurant_orders"
      WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]?.status).toBe("COMPLETED");
    expect(Number(rows[0]?.subtotal)).toBe(500);
    expect(Number(rows[0]?.taxAmount)).toBe(0);
    expect(Number(rows[0]?.total)).toBe(500);
    expect(rows[0]?.accountingPostedAt).not.toBeNull();
    expect(ledgerAfter).toBe(ledgerBefore);
  });
});