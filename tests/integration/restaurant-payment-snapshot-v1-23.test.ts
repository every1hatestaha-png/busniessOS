import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let refundRestaurantPayment: typeof import("@/lib/server/restaurant-refunds")["refundRestaurantPayment"];
const runId = randomUUID();
let userId = "";
let workspaceA = "";
let workspaceB = "";
let cashA = "";
let alternateCashA = "";
let cashB = "";
let alternateOrderA = "";
let alternateOrderB = "";
const actor = (workspaceId = workspaceA) => ({ workspaceId, userId, role: "OWNER" as const });

async function order(workspaceId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "restaurant_orders" ("workspaceId", "orderNumber", "source", "fulfillmentType", "status", "createdById", "subtotal", "total")
    VALUES (${workspaceId}::uuid, ${randomUUID()}, 'MANUAL', 'TAKEAWAY', 'CONFIRMED', ${userId}, 500, 500)
    RETURNING "id"::text AS "id"
  `;
  return rows[0]!.id;
}

async function receipt(existingOrderId?: string) {
  const orderId = existingOrderId ?? await order(workspaceA);
  const idempotencyKey = `receipt:${randomUUID()}`;
  const input = { orderId, cashBankAccountId: cashA, method: "CASH" as const, amount: 200, idempotencyKey };
  const payment = await recordRestaurantPaymentAtCollection(actor(), input);
  return { id: payment.id, orderId, input };
}

async function stored(id: string) {
  return db.$queryRaw<Array<{ id: string; workspaceId: string; restaurantOrderId: string; cashBankAccountId: string; method: string; amount: string; idempotencyKey: string; postedAt: Date | null; voidedAt: Date | null }>>`
    SELECT "id"::text AS "id", "workspaceId"::text AS "workspaceId", "restaurantOrderId"::text AS "restaurantOrderId",
      "cashBankAccountId", "method", "amount"::text AS "amount", "idempotencyKey", "postedAt", "voidedAt"
    FROM "restaurant_payments" WHERE "id"=${id}::uuid
  `;
}

describe("restaurant V1.23 immutable receipt financial identity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds"));
    const user = await db.user.create({ data: { clerkId: `v123-${runId}`, email: `v123-${runId}@example.invalid` } });
    userId = user.id;
    const workspaces = await Promise.all(["A", "B"].map((suffix) => db.workspace.create({
      data: { name: `Receipt snapshot ${suffix} ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
    })));
    [workspaceA, workspaceB] = workspaces.map((w) => w.id);
    for (const workspaceId of [workspaceA, workspaceB]) {
      await db.$executeRaw`
        INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
        VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
      `;
    }
    const cashIds: string[] = [];
    for (const [workspaceId, name] of [[workspaceA, "Original drawer"], [workspaceA, "Alternate drawer"], [workspaceB, "Other tenant drawer"]]) {
      const created = await createCashBankAccount(actor(workspaceId), { name, openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" });
      const accounts = await getCashBankAccounts(workspaceId);
      cashIds.push(accounts.find((a) => a.id === created.id)!.cashBankAccountId);
    }
    [cashA, alternateCashA, cashB] = cashIds;
    alternateOrderA = await order(workspaceA);
    alternateOrderB = await order(workspaceB);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    for (const workspaceId of [workspaceA, workspaceB]) {
      await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
      await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_inventory_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
      await db.product.deleteMany({ where: { workspaceId } });
      await db.cashBankAccount.deleteMany({ where: { workspaceId } });
      await db.account.deleteMany({ where: { workspaceId } });
      await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.auditLog.deleteMany({ where: { workspaceId } });
    }
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  for (const field of ["id", "amount", "method", "restaurantOrderId", "cashBankAccountId", "idempotencyKey", "tenant"] as const) {
    it(`rejects rewriting posted receipt ${field} and preserves its ledger and cash`, async () => {
      const payment = await receipt();
      const before = await stored(payment.id);
      expect(before[0]!.postedAt).not.toBeNull();
      const ledger = await db.generalLedgerEntry.findMany({ where: { sourceId: payment.id }, orderBy: { id: "asc" } });
      expect(ledger.length).toBeGreaterThanOrEqual(2);
      const balances = await db.cashBankAccount.findMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } }, orderBy: { id: "asc" } });
      const mutation = field === "tenant"
        ? db.$executeRaw`UPDATE "restaurant_payments" SET "workspaceId"=${workspaceB}::uuid, "restaurantOrderId"=${alternateOrderB}::uuid, "cashBankAccountId"=${cashB} WHERE "id"=${payment.id}::uuid`
        : field === "id"
        ? db.$executeRaw`UPDATE "restaurant_payments" SET "id"=${randomUUID()}::uuid WHERE "id"=${payment.id}::uuid`
        : field === "amount"
        ? db.$executeRaw`UPDATE "restaurant_payments" SET "amount"=100 WHERE "id"=${payment.id}::uuid`
        : field === "method"
        ? db.$executeRaw`UPDATE "restaurant_payments" SET "method"='OTHER' WHERE "id"=${payment.id}::uuid`
        : field === "restaurantOrderId"
        ? db.$executeRaw`UPDATE "restaurant_payments" SET "restaurantOrderId"=${alternateOrderA}::uuid WHERE "id"=${payment.id}::uuid`
        : field === "cashBankAccountId"
        ? db.$executeRaw`UPDATE "restaurant_payments" SET "cashBankAccountId"=${alternateCashA} WHERE "id"=${payment.id}::uuid`
        : db.$executeRaw`UPDATE "restaurant_payments" SET "idempotencyKey"=${`changed:${randomUUID()}`} WHERE "id"=${payment.id}::uuid`;
      await expect(mutation).rejects.toThrow("Restaurant payment financial snapshot is immutable");
      expect(await stored(payment.id)).toEqual(before);
      expect(await db.generalLedgerEntry.findMany({ where: { sourceId: payment.id }, orderBy: { id: "asc" } })).toEqual(ledger);
      expect(await db.cashBankAccount.findMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } }, orderBy: { id: "asc" } })).toEqual(balances);
    });
  }

  it("preserves idempotent collection, unchanged snapshot updates, notes and real refund reversal", async () => {
    const { createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace");
    const { transitionRestaurantOrderWithIntegrity } = await import("@/lib/server/restaurant-integrity");
    const product = await db.product.create({ data: { workspaceId: workspaceA, name: "Refund meal", sku: `V123-${runId}`, stockQuantity: 20, costPrice: 100, sellingPrice: 500 } });
    const category = await createRestaurantMenuCategory(actor(), { name: "Refund menu" });
    const item = await createRestaurantMenuItem(actor(), { categoryId: category.id, productId: product.id, name: "Refund meal", price: 500 });
    const posOrder = await createPosRestaurantOrder(actor(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: item.id, quantity: 1 }] });
    const payment = await receipt(posOrder.id);
    const before = await stored(payment.id);
    const count = await db.generalLedgerEntry.count({ where: { sourceId: payment.id } });
    const retry = await recordRestaurantPaymentAtCollection(actor(), payment.input);
    expect(retry).toMatchObject({ id: payment.id, idempotent: true });
    expect(await db.generalLedgerEntry.count({ where: { sourceId: payment.id } })).toBe(count);
    await db.$executeRaw`
      UPDATE "restaurant_payments" SET "workspaceId"=${workspaceA}::uuid, "amount"=200, "notes"='Receipt note corrected' WHERE "id"=${payment.id}::uuid
    `;
    expect(await stored(payment.id)).toEqual(before);
    for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
      await transitionRestaurantOrderWithIntegrity(actor(), payment.orderId, status);
    }
    const balanceBeforeRefund = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashA } });
    const refundInput = { paymentId: payment.id, reason: "Customer requested refund", idempotencyKey: `refund:${randomUUID()}` };
    const refund = await refundRestaurantPayment(actor(), refundInput);
    const ledgerAfterRefund = await db.generalLedgerEntry.count({ where: { workspaceId: workspaceA } });
    const balanceAfterRefund = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashA } });
    expect(balanceAfterRefund.currentBalance.toString()).toBe(balanceBeforeRefund.currentBalance.minus(200).toString());
    expect(await refundRestaurantPayment(actor(), refundInput)).toMatchObject({ id: refund.id, idempotent: true });
    expect(await db.generalLedgerEntry.count({ where: { workspaceId: workspaceA } })).toBe(ledgerAfterRefund);
    expect((await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashA } })).currentBalance.toString()).toBe(balanceAfterRefund.currentBalance.toString());
    const after = await stored(payment.id);
    expect(after[0]).toMatchObject({ ...before[0], voidedAt: expect.any(Date) });
    const status = await db.$queryRaw<Array<{ paymentStatus: string }>>`SELECT "paymentStatus" FROM "restaurant_orders" WHERE "id"=${payment.orderId}::uuid`;
    expect(status).toEqual([{ paymentStatus: "UNPAID" }]);
    const entries = await db.generalLedgerEntry.findMany({ where: { workspaceId: workspaceA, sourceId: payment.id } });
    expect(entries.filter((entry) => entry.reversedAt !== null)).toHaveLength(count);
  });
});
