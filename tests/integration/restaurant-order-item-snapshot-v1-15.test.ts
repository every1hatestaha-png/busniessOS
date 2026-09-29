import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transitionRestaurantOrderWithIntegrity: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let menuItemId = "";
let productId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

async function firstOrderItem(orderId: string) {
  const rows = await db.$queryRaw<Array<{ id: string; itemName: string; quantity: unknown; unitPrice: unknown; lineTotal: unknown; notes: string | null }>>`
    SELECT "id"::text AS "id", "itemName", "quantity", "unitPrice", "lineTotal", "notes"
    FROM "restaurant_order_items"
    WHERE "restaurantOrderId"=${orderId}::uuid
    ORDER BY "createdAt", "id"
    LIMIT 1
  `;
  return rows[0]!;
}

async function complete(orderId: string) {
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "PREPARING");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "READY");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "COMPLETED");
}

describe("restaurant V1.15 order item snapshot immutability", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity } = await import("@/lib/server/restaurant-integrity"));

    const user = await db.user.create({
      data: { clerkId: `item-snapshot-${runId}`, email: `item-snapshot-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Restaurant Item Snapshot ${runId}`,
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
        name: "Item Snapshot Meal",
        sku: `ITEM-SNAP-${runId}`,
        stockQuantity: 50,
        costPrice: 75,
        sellingPrice: 450,
      },
    });
    productId = product.id;
    const category = await createRestaurantMenuCategory(owner(), { name: "Item Snapshot Menu" });
    const menuItem = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "Item Snapshot Meal",
      price: 450,
    });
    menuItemId = menuItem.id;
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

  it("blocks quantity, price, and modifier mutation but leaves notes independently editable", async () => {
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1, notes: "No onions" }],
    });
    const item = await firstOrderItem(order.id);

    await expect(db.$executeRaw`
      UPDATE "restaurant_order_items"
      SET "quantity"=2, "unitPrice"=1, "lineTotal"=2
      WHERE "id"=${item.id}::uuid
    `).rejects.toThrow("Restaurant order item snapshot is immutable after creation");

    await expect(db.$executeRaw`
      UPDATE "restaurant_order_items"
      SET "modifiers"='["free-extra"]'::jsonb
      WHERE "id"=${item.id}::uuid
    `).rejects.toThrow("Restaurant order item snapshot is immutable after creation");

    await db.$executeRaw`
      UPDATE "restaurant_order_items"
      SET "notes"='Kitchen note corrected'
      WHERE "id"=${item.id}::uuid
    `;
    const stored = await firstOrderItem(order.id);
    expect(Number(stored.quantity)).toBe(1);
    expect(Number(stored.unitPrice)).toBe(450);
    expect(Number(stored.lineTotal)).toBe(450);
    expect(stored.notes).toBe("Kitchen note corrected");
  });

  it("keeps historical line pricing unchanged when the current menu price changes", async () => {
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const item = await firstOrderItem(order.id);

    await db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "price"=999, "updatedAt"=now()
      WHERE "id"=${menuItemId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;

    await expect(db.$executeRaw`
      UPDATE "restaurant_order_items"
      SET "unitPrice"=999, "lineTotal"=999
      WHERE "id"=${item.id}::uuid
    `).rejects.toThrow("Restaurant order item snapshot is immutable after creation");

    const stored = await firstOrderItem(order.id);
    expect(Number(stored.unitPrice)).toBe(450);
    expect(Number(stored.lineTotal)).toBe(450);
  });

  it("prevents mutation after inventory and accounting have been posted", async () => {
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    await complete(order.id);
    const item = await firstOrderItem(order.id);
    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const ledgerBefore = await db.generalLedgerEntry.count({ where: { workspaceId } });

    await expect(db.$executeRaw`
      UPDATE "restaurant_order_items"
      SET "itemName"='Rewritten history', "quantity"=5
      WHERE "id"=${item.id}::uuid
    `).rejects.toThrow("Restaurant order item snapshot is immutable after creation");

    const [stored, stockAfter, ledgerAfter] = await Promise.all([
      firstOrderItem(order.id),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.generalLedgerEntry.count({ where: { workspaceId } }),
    ]);
    expect(stored.itemName).toBe("Item Snapshot Meal");
    expect(Number(stored.quantity)).toBe(1);
    expect(Number(stockAfter.stockQuantity)).toBe(Number(stockBefore.stockQuantity));
    expect(ledgerAfter).toBe(ledgerBefore);
  });
});