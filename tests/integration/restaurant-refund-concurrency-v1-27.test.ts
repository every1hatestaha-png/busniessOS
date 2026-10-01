import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let refund: typeof import("@/lib/server/restaurant-refunds")["refundRestaurantPayment"];

const runId = randomUUID();
let ownerId = "";
let managerId = "";
let workspaceId = "";
let cashId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });
const manager = () => ({ workspaceId, userId: managerId, role: "MANAGER" as const });

async function completedReceipt() {
  const { createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace");
  const { transitionRestaurantOrderWithIntegrity } = await import("@/lib/server/restaurant-integrity");

  const product = await db.product.create({
    data: {
      workspaceId,
      name: `Concurrent refund meal ${randomUUID()}`,
      sku: randomUUID(),
      stockQuantity: 20,
      costPrice: 100,
      sellingPrice: 500,
    },
  });
  const category = await createRestaurantMenuCategory(owner(), { name: `Refund ${randomUUID()}` });
  const item = await createRestaurantMenuItem(owner(), {
    categoryId: category.id,
    productId: product.id,
    name: "Concurrent refund meal",
    price: 500,
  });
  const order = await createPosRestaurantOrder(owner(), {
    fulfillmentType: "TAKEAWAY",
    items: [{ menuItemId: item.id, quantity: 1 }],
  });
  const payment = await collect(owner(), {
    orderId: order.id,
    cashBankAccountId: cashId,
    method: "CASH",
    amount: 200,
    idempotencyKey: `pay:${randomUUID()}`,
  });
  for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
    await transitionRestaurantOrderWithIntegrity(owner(), order.id, status);
  }
  return { orderId: order.id, paymentId: payment.id };
}

async function persistedState(orderId: string, paymentId: string) {
  const [refunds, payment, order, cash, ledgerCount] = await Promise.all([
    db.$queryRaw<Array<{ id: string; amount: unknown; idempotencyKey: string | null }>>`
      SELECT "id"::text AS "id", "amount", "idempotencyKey"
      FROM "restaurant_refunds"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantPaymentId"=${paymentId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<{ voidedAt: Date | null; amount: unknown }>>`
      SELECT "voidedAt", "amount" FROM "restaurant_payments"
      WHERE "id"=${paymentId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.$queryRaw<Array<{ paymentStatus: string }>>`
      SELECT "paymentStatus" FROM "restaurant_orders"
      WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId } }),
    db.generalLedgerEntry.count({ where: { workspaceId } }),
  ]);
  return { refunds, payment, order, cash, ledgerCount };
}

async function assertSingleRefundOutcome(params: {
  orderId: string;
  paymentId: string;
  cashBefore: string;
  ledgerBefore: number;
  results: Array<{ id: string; idempotent: boolean }>;
}) {
  expect(params.results).toHaveLength(2);
  expect(new Set(params.results.map((result) => result.id)).size).toBe(1);
  expect(params.results.filter((result) => result.idempotent === false)).toHaveLength(1);
  expect(params.results.filter((result) => result.idempotent === true)).toHaveLength(1);

  const state = await persistedState(params.orderId, params.paymentId);
  expect(state.refunds).toHaveLength(1);
  expect(Number(state.refunds[0]!.amount)).toBe(200);
  expect(state.payment).toHaveLength(1);
  expect(state.payment[0]!.voidedAt).not.toBeNull();
  expect(state.order).toEqual([{ paymentStatus: "UNPAID" }]);
  expect(state.cash.currentBalance.toString()).toBe(new Prisma.Decimal(params.cashBefore).minus(200).toString());
  expect(state.ledgerCount - params.ledgerBefore).toBe(2);
  return state;
}

describe("restaurant V1.27 refund concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ refundRestaurantPayment: refund } = await import("@/lib/server/restaurant-refunds"));

    const [ownerUser, managerUser] = await Promise.all([
      db.user.create({ data: { clerkId: `v127-owner-${runId}`, email: `v127-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `v127-manager-${runId}`, email: `v127-manager-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    managerId = managerUser.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Refund concurrency ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await db.workspaceMember.create({ data: { workspaceId, userId: managerId, role: "MANAGER" } });
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const created = await createCashBankAccount(owner(), {
      name: "Concurrent refund drawer",
      openingBalance: 0,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceId)).find((account) => account.id === created.id)!.cashBankAccountId;
    const { openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts");
    await openRestaurantCashShiftSafely(owner(), 0, "V1.84 refund concurrency shift");
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
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
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, managerId] } } });
    await db.$disconnect();
  }, 60_000);

  it("serializes simultaneous refunds with different request IDs into one financial reversal", async () => {
    const receipt = await completedReceipt();
    const cashBefore = (await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId } })).currentBalance.toString();
    const ledgerBefore = await db.generalLedgerEntry.count({ where: { workspaceId } });

    const [first, second] = await Promise.all([
      refund(owner(), {
        paymentId: receipt.paymentId,
        reason: "Concurrent customer refund",
        idempotencyKey: `refund:${randomUUID()}`,
      }),
      refund(manager(), {
        paymentId: receipt.paymentId,
        reason: "Concurrent customer refund",
        idempotencyKey: `refund:${randomUUID()}`,
      }),
    ]);

    const state = await assertSingleRefundOutcome({
      ...receipt,
      cashBefore,
      ledgerBefore,
      results: [first, second],
    });

    const retry = await refund(owner(), {
      paymentId: receipt.paymentId,
      reason: "Concurrent customer refund",
      idempotencyKey: `refund:${randomUUID()}`,
    });
    expect(retry).toMatchObject({ id: state.refunds[0]!.id, idempotent: true });
    const afterRetry = await persistedState(receipt.orderId, receipt.paymentId);
    expect(afterRetry.refunds).toEqual(state.refunds);
    expect(afterRetry.cash.currentBalance.toString()).toBe(state.cash.currentBalance.toString());
    expect(afterRetry.ledgerCount).toBe(state.ledgerCount);
  }, 60_000);

  it("deduplicates simultaneous retries using the same request ID", async () => {
    const receipt = await completedReceipt();
    const cashBefore = (await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId } })).currentBalance.toString();
    const ledgerBefore = await db.generalLedgerEntry.count({ where: { workspaceId } });
    const idempotencyKey = `refund:${randomUUID()}`;
    const input = {
      paymentId: receipt.paymentId,
      reason: "Same request concurrent refund",
      idempotencyKey,
    };

    const [first, second] = await Promise.all([
      refund(owner(), input),
      refund(manager(), input),
    ]);

    const state = await assertSingleRefundOutcome({
      ...receipt,
      cashBefore,
      ledgerBefore,
      results: [first, second],
    });
    expect(state.refunds[0]!.idempotencyKey).toBe(idempotencyKey);

    expect(await refund(owner(), input)).toMatchObject({ id: state.refunds[0]!.id, idempotent: true });
    const afterRetry = await persistedState(receipt.orderId, receipt.paymentId);
    expect(afterRetry.refunds).toEqual(state.refunds);
    expect(afterRetry.cash.currentBalance.toString()).toBe(state.cash.currentBalance.toString());
    expect(afterRetry.ledgerCount).toBe(state.ledgerCount);
  }, 60_000);
});
