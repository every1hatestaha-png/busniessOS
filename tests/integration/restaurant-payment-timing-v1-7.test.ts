import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let openCashShift: typeof import("@/lib/server/industry-modules")["openCashShift"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transitionRestaurantOrderWithIntegrity: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let voidRestaurantPayment: typeof import("@/lib/server/restaurant-integrity")["voidRestaurantPayment"];
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let closeRestaurantCashShiftFromLedger: typeof import("@/lib/server/restaurant-cash-shifts")["closeRestaurantCashShiftFromLedger"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let menuItemId = "";
let cashBankAccountId = "";
const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

async function cleanup() {
  await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
  await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid`;
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

describe("restaurant V1.7 payment collection timing", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ openCashShift } = await import("@/lib/server/industry-modules"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity, voidRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ closeRestaurantCashShiftFromLedger } = await import("@/lib/server/restaurant-cash-shifts"));

    const user = await db.user.create({ data: { clerkId: `payment-timing-${runId}`, email: `payment-timing-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Payment Timing ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(owner(), { name: "Timing Cash", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" });
    const accounts = await getCashBankAccounts(workspaceId);
    cashBankAccountId = accounts.find((account) => account.id === cash.id)!.cashBankAccountId;
    const product = await db.product.create({ data: { workspaceId, name: "Timing Drink", sku: `TIMING-${runId}`, stockQuantity: 20, costPrice: 50, sellingPrice: 200 } });
    const category = await createRestaurantMenuCategory(owner(), { name: "Timing Menu" });
    const menuItem = await createRestaurantMenuItem(owner(), { categoryId: category.id, productId: product.id, name: "Timing Drink", price: 200 });
    menuItemId = menuItem.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await cleanup();
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("posts collected cash before completion and does not post the receipt twice on completion", async () => {
    const shift = await openCashShift(owner(), 100, "Opening drawer");
    const order = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    const cashBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } });

    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId,
      method: "CASH",
      amount: 200,
      idempotencyKey: `timing:${runId}:payment-a`,
    });
    const retry = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId,
      method: "CASH",
      amount: 200,
      idempotencyKey: `timing:${runId}:payment-a`,
    });
    expect(retry).toMatchObject({ id: payment.id, idempotent: true });

    const [paymentRows, cashAfterCollection, receiptsBeforeCompletion, orderBeforeCompletion] = await Promise.all([
      db.$queryRaw<Array<{ postedAt: Date | null }>>`SELECT "postedAt" FROM "restaurant_payments" WHERE "id"=${payment.id}::uuid`,
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "RECEIPT", sourceId: payment.id } }),
      db.$queryRaw<Array<{ status: string; paymentStatus: string; accountingPostedAt: Date | null }>>`
        SELECT "status", "paymentStatus", "accountingPostedAt" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
      `,
    ]);
    expect(paymentRows[0]?.postedAt).toBeTruthy();
    expect(Number(cashAfterCollection.currentBalance) - Number(cashBefore.currentBalance)).toBe(200);
    expect(receiptsBeforeCompletion).toHaveLength(2);
    expect(orderBeforeCompletion[0]).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID", accountingPostedAt: null });

    const shiftResult = await closeRestaurantCashShiftFromLedger(owner(), shift.id, 300, "Cash includes collected order payment");
    expect(shiftResult.expectedCash).toBe(300);
    expect(shiftResult.variance).toBe(0);

    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "PREPARING");
    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "READY");
    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "COMPLETED");

    const [receiptsAfterCompletion, saleEntries] = await Promise.all([
      db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "RECEIPT", sourceId: payment.id } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "SALE", sourceId: order.id } }),
    ]);
    expect(receiptsAfterCompletion).toHaveLength(receiptsBeforeCompletion.length);
    expect(saleEntries.length).toBeGreaterThanOrEqual(4);
  });

  it("reverses a pre-completion receipt immediately so cancellation can proceed safely", async () => {
    await openCashShift(owner(), 0, "Second timing shift");
    const order = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    const cashBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } });
    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId,
      method: "CASH",
      amount: 200,
      idempotencyKey: `timing:${runId}:payment-b`,
    });
    const cashAfterPayment = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } });
    expect(Number(cashAfterPayment.currentBalance) - Number(cashBefore.currentBalance)).toBe(200);

    await voidRestaurantPayment(owner(), payment.id, "Customer cancelled before preparation");
    const cashAfterVoid = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } });
    expect(Number(cashAfterVoid.currentBalance)).toBe(Number(cashBefore.currentBalance));

    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "CANCELLED");
    const rows = await db.$queryRaw<Array<{ status: string; paymentStatus: string }>>`
      SELECT "status", "paymentStatus" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ status: "CANCELLED", paymentStatus: "UNPAID" });
  });
});
