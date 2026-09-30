import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let refund: typeof import("@/lib/server/restaurant-refunds")["refundRestaurantPayment"];
let createReturn: typeof import("@/lib/server/restaurant-item-returns")["createRestaurantItemReturn"];
let reverseReturn: typeof import("@/lib/server/restaurant-return-reversals")["reverseRestaurantItemReturn"];

const runId = randomUUID();
let ownerId = "";
let managerId = "";
let workspaceId = "";
let cashId = "";
let menuItemId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });
const manager = () => ({ workspaceId, userId: managerId, role: "MANAGER" as const });

async function completedPaidOrder() {
  const order = await createOrder(owner(), {
    fulfillmentType: "TAKEAWAY",
    items: [{ menuItemId, quantity: 2 }],
  });
  const payment = await collect(owner(), {
    orderId: order.id,
    cashBankAccountId: cashId,
    method: "CASH",
    amount: 400,
    idempotencyKey: `pay:${randomUUID()}`,
  });
  for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
    await transition(owner(), order.id, status);
  }
  const items = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id"
    FROM "restaurant_order_items"
    WHERE "restaurantOrderId"=${order.id}::uuid
    ORDER BY "createdAt", "id"
    LIMIT 1
  `;
  return { orderId: order.id, paymentId: payment.id, orderItemId: items[0]!.id };
}

async function partialReturn(input: Awaited<ReturnType<typeof completedPaidOrder>>, actor = manager()) {
  return createReturn(actor, {
    orderId: input.orderId,
    reason: "Customer returned one item",
    idempotencyKey: `return:${randomUUID()}`,
    items: [{ orderItemId: input.orderItemId, quantity: 1, restock: false }],
    paymentAllocations: [{ paymentId: input.paymentId, amount: 200 }],
  });
}

async function financialState(orderId: string, paymentId: string) {
  const [cash, paymentRows, refundRows, returns, allocations, orderRows, ledgerCount] = await Promise.all([
    db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId } }),
    db.$queryRaw<Array<{ voidedAt: Date | null }>>`
      SELECT "voidedAt" FROM "restaurant_payments"
      WHERE "id"=${paymentId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.$queryRaw<Array<{ id: string; amount: string }>>`
      SELECT "id"::text AS "id", "amount"::text AS "amount"
      FROM "restaurant_refunds"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantPaymentId"=${paymentId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<{ id: string; total: string; isReversal: boolean }>>`
      SELECT "id"::text AS "id", "total"::text AS "total", "isReversal"
      FROM "restaurant_returns"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<{ amount: string }>>`
      SELECT "amount"::text AS "amount"
      FROM "restaurant_return_payment_allocations"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantPaymentId"=${paymentId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<{ paymentStatus: string }>>`
      SELECT "paymentStatus" FROM "restaurant_orders"
      WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.generalLedgerEntry.count({ where: { workspaceId } }),
  ]);
  const netAllocated = allocations.reduce((sum, row) => sum + Number(row.amount), 0);
  return {
    cash,
    payment: paymentRows[0]!,
    refunds: refundRows,
    returns,
    allocations,
    netAllocated,
    paymentStatus: orderRows[0]!.paymentStatus,
    ledgerCount,
  };
}

describe("restaurant V1.30 refund versus item-return financial integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createOrder,
    } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity: transition } = await import("@/lib/server/restaurant-integrity"));
    ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ refundRestaurantPayment: refund } = await import("@/lib/server/restaurant-refunds"));
    ({ createRestaurantItemReturn: createReturn } = await import("@/lib/server/restaurant-item-returns"));
    ({ reverseRestaurantItemReturn: reverseReturn } = await import("@/lib/server/restaurant-return-reversals"));
    const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");

    const [ownerUser, managerUser] = await Promise.all([
      db.user.create({ data: { clerkId: `v130-owner-${runId}`, email: `v130-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `v130-manager-${runId}`, email: `v130-manager-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    managerId = managerUser.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Refund return concurrency ${runId}`,
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

    // Deliberately keep substantial unrelated cash in the drawer. This proves
    // safety comes from the refund/return invariant, not an incidental
    // insufficient-balance rejection after a partial return.
    const createdCash = await createCashBankAccount(owner(), {
      name: "V1.30 refund drawer",
      openingBalance: 1000,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceId)).find((account) => account.id === createdCash.id)!.cashBankAccountId;

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.30 meal",
        sku: `V130-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createCategory(owner(), { name: `V1.30 ${runId}` });
    const item = await createMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.30 meal",
      price: 200,
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

  it("blocks a full refund after a partial item-return allocation even when the drawer can fund both", async () => {
    const receipt = await completedPaidOrder();
    await partialReturn(receipt);
    const before = await financialState(receipt.orderId, receipt.paymentId);
    expect(before.netAllocated).toBe(200);
    expect(before.refunds).toHaveLength(0);
    expect(before.payment.voidedAt).toBeNull();

    await expect(refund(owner(), {
      paymentId: receipt.paymentId,
      reason: "Attempt full refund after partial item return",
      idempotencyKey: `refund:${randomUUID()}`,
    })).rejects.toThrow("Restaurant payment already has item-return refund allocations; full refund is blocked");

    const after = await financialState(receipt.orderId, receipt.paymentId);
    expect(after.refunds).toEqual(before.refunds);
    expect(after.returns).toEqual(before.returns);
    expect(after.allocations).toEqual(before.allocations);
    expect(after.cash.currentBalance.toString()).toBe(before.cash.currentBalance.toString());
    expect(after.ledgerCount).toBe(before.ledgerCount);
    expect(after.payment.voidedAt).toBeNull();
  }, 60_000);

  it("serializes a simultaneous partial item return and full refund so only one financial reversal path commits", async () => {
    const receipt = await completedPaidOrder();
    const before = await financialState(receipt.orderId, receipt.paymentId);

    const [returnResult, refundResult] = await Promise.allSettled([
      partialReturn(receipt, manager()),
      refund(owner(), {
        paymentId: receipt.paymentId,
        reason: "Concurrent full refund",
        idempotencyKey: `refund:${randomUUID()}`,
      }),
    ]);

    expect([returnResult, refundResult].filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect([returnResult, refundResult].filter((result) => result.status === "rejected")).toHaveLength(1);

    const after = await financialState(receipt.orderId, receipt.paymentId);
    const cashReversed = Number(before.cash.currentBalance) - Number(after.cash.currentBalance);

    if (returnResult.status === "fulfilled") {
      expect(after.refunds).toHaveLength(0);
      expect(after.returns.filter((row) => !row.isReversal)).toHaveLength(1);
      expect(after.netAllocated).toBe(200);
      expect(after.payment.voidedAt).toBeNull();
      expect(cashReversed).toBe(200);
      expect(String((refundResult as PromiseRejectedResult).reason)).toContain("item-return refund allocations");
    } else {
      expect(after.refunds).toHaveLength(1);
      expect(after.returns).toHaveLength(0);
      expect(after.netAllocated).toBe(0);
      expect(after.payment.voidedAt).not.toBeNull();
      expect(cashReversed).toBe(400);
    }

    expect(cashReversed).toBeLessThanOrEqual(400);
  }, 60_000);

  it("allows a full refund after the partial item return has been properly reversed back to net zero", async () => {
    const receipt = await completedPaidOrder();
    const created = await partialReturn(receipt);
    const partial = await financialState(receipt.orderId, receipt.paymentId);
    expect(partial.netAllocated).toBe(200);

    const reversal = await reverseReturn(owner(), created.id, "Customer return was entered in error");
    expect(reversal.alreadyReversed).toBe(false);
    const restored = await financialState(receipt.orderId, receipt.paymentId);
    expect(restored.netAllocated).toBe(0);
    expect(restored.payment.voidedAt).toBeNull();

    const refunded = await refund(owner(), {
      paymentId: receipt.paymentId,
      reason: "Full refund after corrected return history",
      idempotencyKey: `refund:${randomUUID()}`,
    });
    expect(refunded.idempotent).toBe(false);

    const after = await financialState(receipt.orderId, receipt.paymentId);
    expect(after.refunds).toHaveLength(1);
    expect(after.netAllocated).toBe(0);
    expect(after.payment.voidedAt).not.toBeNull();
    expect(Number(restored.cash.currentBalance) - Number(after.cash.currentBalance)).toBe(400);
    expect(after.paymentStatus).toBe("UNPAID");
  }, 60_000);
});
