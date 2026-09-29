import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transitionRestaurantOrderWithIntegrity: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let voidRestaurantPayment: typeof import("@/lib/server/restaurant-integrity")["voidRestaurantPayment"];
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let menuItemId = "";
let cashBankAccountId = "";
const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

async function cleanup() {
  await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
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
}

describe("restaurant V1.10 order lifecycle database guard", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity, voidRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));

    const user = await db.user.create({ data: { clerkId: `lifecycle-${runId}`, email: `lifecycle-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Lifecycle ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(owner(), { name: "Lifecycle Cash", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" });
    const accounts = await getCashBankAccounts(workspaceId);
    cashBankAccountId = accounts.find((account) => account.id === cash.id)!.cashBankAccountId;
    const product = await db.product.create({ data: { workspaceId, name: "Lifecycle Meal", sku: `LC-${runId}`, stockQuantity: 20, costPrice: 100, sellingPrice: 500 } });
    const category = await createRestaurantMenuCategory(owner(), { name: "Lifecycle Menu" });
    const menuItem = await createRestaurantMenuItem(owner(), { categoryId: category.id, productId: product.id, name: "Lifecycle Meal", price: 500 });
    menuItemId = menuItem.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await cleanup();
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("rejects skipped status transitions at the database boundary", async () => {
    const order = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "status"='READY', "updatedAt"=now()
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Invalid restaurant order status transition from CONFIRMED to READY");

    const rows = await db.$queryRaw<Array<{ status: string }>>`SELECT "status" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid`;
    expect(rows[0]?.status).toBe("CONFIRMED");
  });

  it("rejects COMPLETED without inventory and accounting posts but allows the hardened completion flow", async () => {
    const order = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "PREPARING");
    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "READY");

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "status"='COMPLETED', "completedAt"=now(), "updatedAt"=now()
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant order cannot complete before inventory and accounting are posted");

    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "COMPLETED");
    const rows = await db.$queryRaw<Array<{ status: string; inventoryPostedAt: Date | null; accountingPostedAt: Date | null; completedAt: Date | null }>>`
      SELECT "status", "inventoryPostedAt", "accountingPostedAt", "completedAt" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]?.status).toBe("COMPLETED");
    expect(rows[0]?.inventoryPostedAt).toBeTruthy();
    expect(rows[0]?.accountingPostedAt).toBeTruthy();
    expect(rows[0]?.completedAt).toBeTruthy();
  });

  it("rejects cancellation while active money exists and allows cancellation after payment reversal", async () => {
    const order = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId,
      method: "CASH",
      amount: 500,
      idempotencyKey: `lifecycle:${runId}:payment`,
    });

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "status"='CANCELLED', "cancelledAt"=now(), "updatedAt"=now()
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant order cannot be cancelled while active payments exist");

    await voidRestaurantPayment(owner(), payment.id, "Customer cancelled before preparation");
    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "CANCELLED");
    const rows = await db.$queryRaw<Array<{ status: string; cancelledAt: Date | null }>>`
      SELECT "status", "cancelledAt" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]?.status).toBe("CANCELLED");
    expect(rows[0]?.cancelledAt).toBeTruthy();
  });

  it("keeps terminal orders terminal", async () => {
    const order = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "PREPARING");
    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "READY");
    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "COMPLETED");

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders" SET "status"='READY', "updatedAt"=now()
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Invalid restaurant order status transition from COMPLETED to READY");
  });
});
