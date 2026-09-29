import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transitionRestaurantOrderWithIntegrity: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let recordRestaurantPayment: typeof import("@/lib/server/restaurant-integrity")["recordRestaurantPayment"];
let returnRestaurantItems: typeof import("@/lib/server/restaurant-returns")["returnRestaurantItems"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let menuItemId = "";
let productId = "";
let cashAccountId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId });
const staff = () => ({ workspaceId, role: "STAFF" as const, userId });

async function enableRestaurant() {
  await db.$executeRaw`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    ON CONFLICT ("workspaceId", "moduleKey") DO UPDATE SET "enabled"=true, "updatedAt"=now()
  `;
}

async function complete(orderId: string) {
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "PREPARING");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "READY");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "COMPLETED");
}

describe("restaurant workspace v1.3 item return integrity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity, recordRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ returnRestaurantItems } = await import("@/lib/server/restaurant-returns"));

    const user = await db.user.create({ data: { clerkId: `restaurant-return-${runId}`, email: `restaurant-return-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Restaurant Return ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await enableRestaurant();

    const cash = await createCashBankAccount(owner(), { name: "Returns Cash", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" });
    const accounts = await getCashBankAccounts(workspaceId);
    cashAccountId = accounts.find((account) => account.id === cash.id)!.cashBankAccountId;

    const product = await db.product.create({
      data: { workspaceId, name: "Return Burger", sku: `RET-${runId}`, stockQuantity: 20, costPrice: 80, sellingPrice: 200 },
    });
    productId = product.id;
    const category = await createRestaurantMenuCategory(owner(), { name: "Returns" });
    const menuItem = await createRestaurantMenuItem(owner(), { categoryId: category.id, productId, name: "Return Burger", price: 200 });
    menuItemId = menuItem.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "restaurant_item_return_lines" WHERE "restaurantItemReturnId" IN (SELECT "id" FROM "restaurant_item_returns" WHERE "workspaceId"=${workspaceId}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_item_returns" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_item_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
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

  it("restores exact stock and posts balanced partial return accounting", async () => {
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      taxAmount: 40,
      discountAmount: 20,
      items: [{ menuItemId, quantity: 2 }],
    });
    const details = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items" WHERE "restaurantOrderId"=${order.id}::uuid LIMIT 1
    `;
    const orderItemId = details[0]!.id;
    await recordRestaurantPayment(owner(), {
      orderId: order.id,
      cashBankAccountId: cashAccountId,
      method: "CASH",
      amount: 420,
      idempotencyKey: `return:${runId}:payment`,
    });
    await complete(order.id);

    const beforeProduct = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const beforeCash = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
    const result = await returnRestaurantItems(owner(), {
      orderId: order.id,
      reason: "Customer returned one item",
      idempotencyKey: `return:${runId}:one`,
      cashBankAccountId: cashAccountId,
      lines: [{ orderItemId, quantity: 1 }],
    });
    const retry = await returnRestaurantItems(owner(), {
      orderId: order.id,
      reason: "Customer returned one item",
      idempotencyKey: `return:${runId}:one`,
      cashBankAccountId: cashAccountId,
      lines: [{ orderItemId, quantity: 1 }],
    });
    expect(retry).toMatchObject({ id: result.id, idempotent: true });

    const [afterProduct, afterCash, returnRows, consumptionRows, gl, audits] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountId } }),
      db.$queryRaw<Array<{ subtotalAmount: unknown; taxAmount: unknown; refundAmount: unknown; inventoryCost: unknown }>>`
        SELECT "subtotalAmount", "taxAmount", "refundAmount", "inventoryCost" FROM "restaurant_item_returns" WHERE "id"=${result.id}::uuid
      `,
      db.$queryRaw<Array<{ quantity: unknown }>>`
        SELECT "quantity" FROM "restaurant_order_item_consumptions" WHERE "restaurantOrderItemId"=${orderItemId}::uuid AND "productId"=${productId}
      `,
      db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "ADJUSTMENT", sourceId: result.id } }),
      db.auditLog.findMany({ where: { workspaceId, action: "restaurant.items.returned", entityId: result.id } }),
    ]);

    expect(Number(afterProduct.stockQuantity) - Number(beforeProduct.stockQuantity)).toBe(1);
    expect(Number(beforeCash.currentBalance) - Number(afterCash.currentBalance)).toBe(210);
    expect(Number(returnRows[0]?.subtotalAmount)).toBe(190);
    expect(Number(returnRows[0]?.taxAmount)).toBe(20);
    expect(Number(returnRows[0]?.refundAmount)).toBe(210);
    expect(Number(returnRows[0]?.inventoryCost)).toBe(80);
    expect(Number(consumptionRows[0]?.quantity)).toBe(2);
    const debit = gl.reduce((sum, row) => sum + Number(row.debit), 0);
    const credit = gl.reduce((sum, row) => sum + Number(row.credit), 0);
    expect(debit).toBe(credit);
    expect(audits).toHaveLength(1);
  });

  it("blocks over-return and staff return attempts", async () => {
    const order = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    const details = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items" WHERE "restaurantOrderId"=${order.id}::uuid LIMIT 1
    `;
    const orderItemId = details[0]!.id;
    await complete(order.id);

    await expect(returnRestaurantItems(staff(), {
      orderId: order.id,
      reason: "Unauthorized return",
      idempotencyKey: `return:${runId}:staff`,
      lines: [{ orderItemId, quantity: 1 }],
    })).rejects.toThrow("Manager access is required");

    await expect(returnRestaurantItems(owner(), {
      orderId: order.id,
      reason: "Too many items",
      idempotencyKey: `return:${runId}:too-many`,
      lines: [{ orderItemId, quantity: 2 }],
    })).rejects.toThrow("Returned quantity cannot exceed");
  });
});
