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
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ cashShiftId: shift.id });
      expect(rows[0]?.postedAt).not.toBeNull();
    } else {
      expect(rows).toHaveLength(0);
      expect(String(paymentResult.reason)).toMatch(/open restaurant cash shift|required before recording a cash payment/i);
    }
  }, 90_000);
});
