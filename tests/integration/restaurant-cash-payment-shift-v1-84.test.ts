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
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let openRestaurantCashShiftSafely: typeof import("@/lib/server/restaurant-cash-shifts")["openRestaurantCashShiftSafely"];
let closeRestaurantCashShiftFromLedger: typeof import("@/lib/server/restaurant-cash-shifts")["closeRestaurantCashShiftFromLedger"];

const runId = randomUUID();
let ownerId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let cashAccountId = "";
let bankAccountId = "";
let menuItemId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });
const otherOwner = () => ({ workspaceId: otherWorkspaceId, userId: ownerId, role: "OWNER" as const });

async function newOrder() {
  return createPosRestaurantOrder(owner(), {
    fulfillmentType: "TAKEAWAY",
    items: [{ menuItemId, quantity: 1 }],
  });
}

async function complete(orderId: string) {
  for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
    await transitionRestaurantOrderWithIntegrity(owner(), orderId, status);
  }
}

async function paymentRow(paymentId: string) {
  const rows = await db.$queryRaw<Array<{ cashShiftId: string | null; postedAt: Date | null }>>`
    SELECT "cashShiftId"::text AS "cashShiftId", "postedAt"
    FROM "restaurant_payments"
    WHERE "id"=${paymentId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return rows[0]!;
}

describe("restaurant V1.84 cash payment shift integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity, recordRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ openRestaurantCashShiftSafely, closeRestaurantCashShiftFromLedger } = await import("@/lib/server/restaurant-cash-shifts"));

    const user = await db.user.create({
      data: { clerkId: `v184-owner-${runId}`, email: `v184-owner-${runId}@example.invalid` },
    });
    ownerId = user.id;

    const [workspace, other] = await Promise.all([
      db.workspace.create({
        data: {
          name: `V1.84 cash shift ${runId}`,
          vertical: "LEGACY",
          members: { create: { userId: ownerId, role: "OWNER" } },
        },
      }),
      db.workspace.create({
        data: {
          name: `V1.84 other ${runId}`,
          vertical: "LEGACY",
          members: { create: { userId: ownerId, role: "OWNER" } },
        },
      }),
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;

    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES
        (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now()),
        (${otherWorkspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    await Promise.all([
      createCashBankAccount(owner(), {
        name: "V1.84 drawer",
        openingBalance: 0,
        isBank: false,
        bankName: "",
        accountTitle: "",
        accountNumber: "",
        notes: "",
      }),
      createCashBankAccount(owner(), {
        name: "V1.84 bank",
        openingBalance: 0,
        isBank: true,
        bankName: "Test Bank",
        accountTitle: "Restaurant",
        accountNumber: `V184-${runId.slice(0, 8)}`,
        notes: "",
      }),
    ]);
    const accounts = await getCashBankAccounts(workspaceId);
    cashAccountId = accounts.find((account) => !account.isBank)!.cashBankAccountId;
    bankAccountId = accounts.find((account) => account.isBank)!.cashBankAccountId;

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.84 meal",
        sku: `V184-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: `V1.84 ${runId}` });
    const item = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.84 meal",
      price: 200,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("stores immutable open-shift evidence on a service cash receipt", async () => {
    const shift = await openRestaurantCashShiftSafely(owner(), 0, "V1.84 service evidence");
    const order = await newOrder();
    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId: cashAccountId,
      method: "CASH",
      amount: 200,
      idempotencyKey: `v184:service:${randomUUID()}`,
    });

    expect(await paymentRow(payment.id)).toMatchObject({ cashShiftId: shift.id });
    expect((await paymentRow(payment.id)).postedAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "restaurant_payments"
      SET "cashShiftId"=NULL
      WHERE "id"=${payment.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant payment cash shift evidence is immutable");

    await closeRestaurantCashShiftFromLedger(owner(), shift.id, 200, "Service evidence shift close");
  }, 60_000);

  it("cannot bypass drawer reconciliation by labeling physical cash as OTHER", async () => {
    const order = await newOrder();
    const before = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
    await expect(recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId: cashAccountId,
      method: "OTHER",
      amount: 200,
      idempotencyKey: `v186:other:${randomUUID()}`,
    })).rejects.toThrow(/cash|shift|settlement/i);
    const after = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
    expect(after.currentBalance.toString()).toBe(before.currentBalance.toString());
    const payments = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_payments"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${order.id}::uuid
    `;
    expect(payments[0]?.count).toBe(0);
  });

  it("rejects direct OTHER cash inserts and preserves OTHER bank settlement", async () => {
    const order = await newOrder();
    await expect(db.$executeRaw`
      INSERT INTO "restaurant_payments" (
        "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "createdById"
      ) VALUES (
        ${workspaceId}::uuid, ${order.id}::uuid, ${cashAccountId}, 'OTHER', 200, ${ownerId}
      )
    `).rejects.toThrow(/Non-cash restaurant payments must use a bank/i);
    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id, cashBankAccountId: bankAccountId, method: "OTHER", amount: 200,
      idempotencyKey: `v186:other-bank:${randomUUID()}`,
    });
    expect(await paymentRow(payment.id)).toMatchObject({ cashShiftId: null });
    expect((await paymentRow(payment.id)).postedAt).not.toBeNull();
  });

  it("fails closed for missing, cross-workspace, and non-cash shift references", async () => {
    const shift = await openRestaurantCashShiftSafely(owner(), 0, "V1.84 DB guard");
    const otherShift = await openRestaurantCashShiftSafely(otherOwner(), 0, "V1.84 other shift");
    const order = await newOrder();

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_payments" (
        "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "createdById"
      ) VALUES (
        ${workspaceId}::uuid, ${order.id}::uuid, ${cashAccountId}, 'CASH', 1, ${ownerId}
      )
    `).rejects.toThrow(/open restaurant cash shift is required/i);

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_payments" (
        "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "createdById", "cashShiftId"
      ) VALUES (
        ${workspaceId}::uuid, ${order.id}::uuid, ${cashAccountId}, 'CASH', 1, ${ownerId}, ${otherShift.id}::uuid
      )
    `).rejects.toThrow(/shift must belong to the same workspace/i);

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_payments" (
        "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "createdById", "cashShiftId"
      ) VALUES (
        ${workspaceId}::uuid, ${order.id}::uuid, ${bankAccountId}, 'BANK_TRANSFER', 1, ${ownerId}, ${shift.id}::uuid
      )
    `).rejects.toThrow(/non-cash restaurant payments cannot reference a cash shift/i);

    await closeRestaurantCashShiftFromLedger(owner(), shift.id, 0, "No accepted cash receipts");
    await closeRestaurantCashShiftFromLedger(otherOwner(), otherShift.id, 0, "No accepted cash receipts");
  }, 60_000);

  it("blocks shift close while a linked cash receipt is still unposted", async () => {
    const shift = await openRestaurantCashShiftSafely(owner(), 0, "V1.84 deferred receipt");
    const order = await newOrder();
    const payment = await recordRestaurantPayment(owner(), {
      orderId: order.id,
      cashBankAccountId: cashAccountId,
      method: "CASH",
      amount: 100,
      idempotencyKey: `v184:deferred:${randomUUID()}`,
    });

    expect(await paymentRow(payment.id)).toMatchObject({ cashShiftId: shift.id, postedAt: null });

    await expect(closeRestaurantCashShiftFromLedger(owner(), shift.id, 0, "Unsafe early close"))
      .rejects.toThrow(/cannot close while cash payments are still unposted/i);

    await complete(order.id);
    expect((await paymentRow(payment.id)).postedAt).not.toBeNull();

    const closed = await closeRestaurantCashShiftFromLedger(owner(), shift.id, 100, "Posted before close");
    expect(closed.expectedCash).toBe(100);
    expect(closed.variance).toBe(0);
  }, 60_000);

  it("serializes final cash collection against shift close", async () => {
    const shift = await openRestaurantCashShiftSafely(owner(), 0, "V1.84 close race");
    const order = await newOrder();

    const [paymentResult, closeResult] = await Promise.allSettled([
      recordRestaurantPaymentAtCollection(owner(), {
        orderId: order.id,
        cashBankAccountId: cashAccountId,
        method: "CASH",
        amount: 200,
        idempotencyKey: `v184:race:${randomUUID()}`,
      }),
      closeRestaurantCashShiftFromLedger(owner(), shift.id, 0, "Concurrent close"),
    ]);

    expect(closeResult.status).toBe("fulfilled");

    const shifts = await db.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "cash_shifts"
      WHERE "id"=${shift.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    expect(shifts[0]?.status).toBe("CLOSED");

    const rows = await db.$queryRaw<Array<{ id: string; cashShiftId: string | null; postedAt: Date | null }>>`
      SELECT "id"::text AS "id", "cashShiftId"::text AS "cashShiftId", "postedAt"
      FROM "restaurant_payments"
      WHERE "workspaceId"=${workspaceId}::uuid
        AND "restaurantOrderId"=${order.id}::uuid
        AND "voidedAt" IS NULL
    `;

    if (paymentResult.status === "fulfilled") {
      if (closeResult.status === "fulfilled") expect(closeResult.value.expectedCash).toBe(200);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ cashShiftId: shift.id });
      expect(rows[0]?.postedAt).not.toBeNull();
    } else {
      if (closeResult.status === "fulfilled") expect(closeResult.value.expectedCash).toBe(0);
      expect(rows).toHaveLength(0);
      expect(String(paymentResult.reason)).toMatch(/open restaurant cash shift|required before recording a cash payment/i);
    }
  }, 90_000);

  it("requires an open shift for a physical cash refund after the receipt shift closed", async () => {
    const { refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds");
    const shift = await openRestaurantCashShiftSafely(owner(), 0, "V1.86 refund boundary");
    const order = await newOrder();
    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id, cashBankAccountId: cashAccountId, method: "CASH", amount: 200,
      idempotencyKey: `v186:refund-source:${randomUUID()}`,
    });
    await complete(order.id);
    const closed = await closeRestaurantCashShiftFromLedger(owner(), shift.id, 200);
    expect(closed.expectedCash).toBe(200);
    await expect(refundRestaurantPayment(owner(), {
      paymentId: payment.id, reason: "Cash refund after drawer close",
      idempotencyKey: `v186:refund:${randomUUID()}`,
    })).rejects.toThrow(/open.*cash shift|cash shift.*open/i);
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_refunds"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantPaymentId"=${payment.id}::uuid
    `;
    expect(rows[0]?.count).toBe(0);
    const refundShift = await openRestaurantCashShiftSafely(owner(), 200);
    await refundRestaurantPayment(owner(), {
      paymentId: payment.id, reason: "Cash refund in current drawer",
      idempotencyKey: `v186:refund-current:${randomUUID()}`,
    });
    expect((await closeRestaurantCashShiftFromLedger(owner(), refundShift.id, 0)).expectedCash).toBe(0);
  }, 60_000);

  it("rolls back a posted cash void without a drawer and reconciles it in the next shift", async () => {
    const { voidRestaurantPayment } = await import("@/lib/server/restaurant-integrity");
    const shift = await openRestaurantCashShiftSafely(owner(), 0);
    const order = await newOrder();
    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id, cashBankAccountId: cashAccountId, method: "CASH", amount: 200,
    });
    await closeRestaurantCashShiftFromLedger(owner(), shift.id, 200);
    const before = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
    await expect(voidRestaurantPayment(owner(), payment.id, "Void after close"))
      .rejects.toThrow(/open.*cash shift/i);
    await expect(db.$executeRaw`
      UPDATE "restaurant_payments" SET "voidedAt"=CURRENT_TIMESTAMP,
        "voidedById"=${ownerId}, "voidReason"='Direct void after shift closed'
      WHERE "id"=${payment.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow(/open.*cash shift/i);
    expect((await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountId } })).currentBalance.toString())
      .toBe(before.currentBalance.toString());
    const next = await openRestaurantCashShiftSafely(owner(), 200);
    await voidRestaurantPayment(owner(), payment.id, "Void in current drawer");
    expect((await closeRestaurantCashShiftFromLedger(owner(), next.id, 0)).expectedCash).toBe(0);
  });

  it("rolls back cash item returns and reversals outside an open shift", async () => {
    const { createRestaurantItemReturn } = await import("@/lib/server/restaurant-item-returns");
    const { reverseRestaurantItemReturn } = await import("@/lib/server/restaurant-return-reversals");
    const shift = await openRestaurantCashShiftSafely(owner(), 0);
    const order = await newOrder();
    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id, cashBankAccountId: cashAccountId, method: "CASH", amount: 200,
    });
    await complete(order.id);
    await closeRestaurantCashShiftFromLedger(owner(), shift.id, 200);
    const items = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items" WHERE "restaurantOrderId"=${order.id}::uuid
    `;
    const input = {
      orderId: order.id, reason: "Return after close", idempotencyKey: `v186:return:${randomUUID()}`,
      items: [{ orderItemId: items[0]!.id, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    };
    await expect(createRestaurantItemReturn(owner(), input)).rejects.toThrow(/open.*cash shift/i);
    const returnedRows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_returns" WHERE "restaurantOrderId"=${order.id}::uuid
    `;
    expect(returnedRows[0]?.count).toBe(0);
    const returnShift = await openRestaurantCashShiftSafely(owner(), 200);
    const returned = await createRestaurantItemReturn(owner(), input);
    expect((await closeRestaurantCashShiftFromLedger(owner(), returnShift.id, 0)).expectedCash).toBe(0);
    await expect(reverseRestaurantItemReturn(owner(), returned.id, "Reverse after close"))
      .rejects.toThrow(/open.*cash shift/i);
    const reversals = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_returns" WHERE "reversalOfId"=${returned.id}::uuid
    `;
    expect(reversals[0]?.count).toBe(0);
    const reversalShift = await openRestaurantCashShiftSafely(owner(), 0);
    await reverseRestaurantItemReturn(owner(), returned.id, "Reverse in current drawer");
    expect((await closeRestaurantCashShiftFromLedger(owner(), reversalShift.id, 200)).expectedCash).toBe(200);
  });

  it("cannot void the full receipt after a partial item refund", async () => {
    const { createRestaurantItemReturn } = await import("@/lib/server/restaurant-item-returns");
    const { voidRestaurantPayment } = await import("@/lib/server/restaurant-integrity");
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 2 }],
    });
    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id, cashBankAccountId: bankAccountId, method: "BANK_TRANSFER", amount: 400,
    });
    await complete(order.id);
    const items = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items" WHERE "restaurantOrderId"=${order.id}::uuid
    `;
    await createRestaurantItemReturn(owner(), {
      orderId: order.id, reason: "One item refunded", idempotencyKey: `v186:partial:${randomUUID()}`,
      items: [{ orderItemId: items[0]!.id, quantity: 1, restock: false }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });
    const before = await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankAccountId } });
    await expect(voidRestaurantPayment(owner(), payment.id, "Attempt duplicate cash outflow"))
      .rejects.toThrow(/return|allocat|refund/i);
    await expect(db.$executeRaw`
      UPDATE "restaurant_payments" SET "voidedAt"=CURRENT_TIMESTAMP,
        "voidedById"=${ownerId}, "voidReason"='Direct partial-return void'
      WHERE "id"=${payment.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow(/partial item-return refund allocations/i);
    expect((await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankAccountId } })).currentBalance.toString())
      .toBe(before.currentBalance.toString());
  });

  it("reconciles a refund racing shift close or rejects it without financial residue", async () => {
    const { refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds");
    const shift = await openRestaurantCashShiftSafely(owner(), 0);
    const order = await newOrder();
    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id, cashBankAccountId: cashAccountId, method: "CASH", amount: 200,
    });
    await complete(order.id);
    const [refund, close] = await Promise.allSettled([
      refundRestaurantPayment(owner(), { paymentId: payment.id, reason: "Concurrent drawer refund" }),
      closeRestaurantCashShiftFromLedger(owner(), shift.id, 0),
    ]);
    expect(close.status).toBe("fulfilled");
    if (close.status !== "fulfilled") throw close.reason;
    const refunds = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_refunds" WHERE "restaurantPaymentId"=${payment.id}::uuid
    `;
    if (refund.status === "fulfilled") {
      expect(close.value.expectedCash).toBe(0);
      expect(refunds[0]?.count).toBe(1);
    } else {
      expect(String(refund.reason)).toMatch(/open.*cash shift/i);
      expect(close.value.expectedCash).toBe(200);
      expect(refunds[0]?.count).toBe(0);
    }
  });
});
