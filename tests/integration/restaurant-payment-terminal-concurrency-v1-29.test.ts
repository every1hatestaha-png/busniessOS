import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];

const runId = randomUUID();
let ownerId = "";
let managerId = "";
let workspaceId = "";
let cashId = "";
let menuItemId = "";
let productId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });
const manager = () => ({ workspaceId, userId: managerId, role: "MANAGER" as const });

async function freshOrder() {
  return createOrder(owner(), {
    fulfillmentType: "TAKEAWAY",
    items: [{ menuItemId, quantity: 1 }],
  });
}

async function orderState(orderId: string) {
  const [orderRows, payments, cash, product, ledger] = await Promise.all([
    db.$queryRaw<Array<{
      status: string;
      paymentStatus: string;
      inventoryPostedAt: Date | null;
      accountingPostedAt: Date | null;
    }>>`
      SELECT "status", "paymentStatus", "inventoryPostedAt", "accountingPostedAt"
      FROM "restaurant_orders"
      WHERE "workspaceId"=${workspaceId}::uuid AND "id"=${orderId}::uuid
    `,
    db.$queryRaw<Array<{ id: string; amount: string; postedAt: Date | null; voidedAt: Date | null }>>`
      SELECT "id"::text AS "id", "amount"::text AS "amount", "postedAt", "voidedAt"
      FROM "restaurant_payments"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId } }),
    db.product.findUniqueOrThrow({ where: { id: productId } }),
    db.generalLedgerEntry.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
  ]);
  return { order: orderRows[0]!, payments, cash, product, ledger };
}

describe("restaurant V1.29 payment versus terminal transition concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ transitionRestaurantOrderWithIntegrity: transition } = await import("@/lib/server/restaurant-integrity"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createOrder,
    } = await import("@/lib/server/restaurant-workspace"));
    const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");

    const [ownerUser, managerUser] = await Promise.all([
      db.user.create({ data: { clerkId: `v129-owner-${runId}`, email: `v129-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `v129-manager-${runId}`, email: `v129-manager-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    managerId = managerUser.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Payment terminal concurrency ${runId}`,
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

    const cash = await createCashBankAccount(owner(), {
      name: "Terminal race drawer",
      openingBalance: 0,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceId)).find((account) => account.id === cash.id)!.cashBankAccountId;
    const { openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts");
    await openRestaurantCashShiftSafely(owner(), 0, "Terminal concurrency test shift");

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "Terminal race meal",
        sku: `V129-${runId}`,
        stockQuantity: 100,
        costPrice: 100,
        sellingPrice: 500,
      },
    });
    productId = product.id;
    const category = await createCategory(owner(), { name: `Terminal race ${runId}` });
    const menuItem = await createMenuItem(owner(), {
      categoryId: category.id,
      productId,
      name: "Terminal race meal",
      price: 500,
    });
    menuItemId = menuItem.id;
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

  it("never commits both cancellation and a new active payment", async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const order = await freshOrder();
      const before = await orderState(order.id);
      const paymentInput = {
        orderId: order.id,
        cashBankAccountId: cashId,
        method: "CASH" as const,
        amount: 200,
        idempotencyKey: `pay:${randomUUID()}`,
      };

      const [paymentResult, cancellationResult] = await Promise.allSettled([
        collect(owner(), paymentInput),
        transition(manager(), order.id, "CANCELLED"),
      ]);

      const after = await orderState(order.id);
      if (after.order.status === "CANCELLED") {
        expect(cancellationResult.status).toBe("fulfilled");
        expect(paymentResult.status).toBe("rejected");
        expect(after.payments).toHaveLength(0);
        expect(after.order.paymentStatus).toBe("UNPAID");
        expect(after.cash.currentBalance.toString()).toBe(before.cash.currentBalance.toString());
        expect(after.ledger).toEqual(before.ledger);
      } else {
        expect(after.order.status).toBe("CONFIRMED");
        expect(paymentResult.status).toBe("fulfilled");
        expect(cancellationResult.status).toBe("rejected");
        expect(after.payments).toHaveLength(1);
        expect(after.payments[0]!.postedAt).not.toBeNull();
        expect(after.payments[0]!.voidedAt).toBeNull();
        expect(after.order.paymentStatus).toBe("PARTIALLY_PAID");
        expect(after.cash.currentBalance.toString()).toBe(before.cash.currentBalance.plus(200).toString());
        expect(after.ledger.length - before.ledger.length).toBe(2);
      }
      expect(!(after.order.status === "CANCELLED" && after.payments.some((payment) => payment.voidedAt === null))).toBe(true);
    }
  }, 90_000);

  it("allows payment and completion to serialize without duplicate cash, receipt ledger, or inventory posting", async () => {
    const order = await freshOrder();
    await transition(owner(), order.id, "PREPARING");
    await transition(owner(), order.id, "READY");
    const before = await orderState(order.id);
    const stockBefore = before.product.stockQuantity;
    const idempotencyKey = `pay:${randomUUID()}`;

    const [payment, completion] = await Promise.all([
      collect(owner(), {
        orderId: order.id,
        cashBankAccountId: cashId,
        method: "CASH",
        amount: 200,
        idempotencyKey,
      }),
      transition(manager(), order.id, "COMPLETED"),
    ]);

    expect(payment.idempotent).toBe(false);
    expect(completion.status).toBe("COMPLETED");

    const after = await orderState(order.id);
    expect(after.order.status).toBe("COMPLETED");
    expect(after.order.paymentStatus).toBe("PARTIALLY_PAID");
    expect(after.order.inventoryPostedAt).not.toBeNull();
    expect(after.order.accountingPostedAt).not.toBeNull();
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]!.id).toBe(payment.id);
    expect(after.payments[0]!.postedAt).not.toBeNull();
    expect(after.payments[0]!.voidedAt).toBeNull();
    expect(after.cash.currentBalance.toString()).toBe(before.cash.currentBalance.plus(200).toString());
    expect(after.product.stockQuantity.toString()).toBe(stockBefore.minus(1).toString());

    const receiptEntries = after.ledger.filter((entry) => entry.sourceId === payment.id);
    expect(receiptEntries).toHaveLength(2);

    const retry = await collect(manager(), {
      orderId: order.id,
      cashBankAccountId: cashId,
      method: "CASH",
      amount: 200,
      idempotencyKey,
    });
    expect(retry).toMatchObject({ id: payment.id, idempotent: true });
    const retried = await orderState(order.id);
    expect(retried.cash.currentBalance.toString()).toBe(after.cash.currentBalance.toString());
    expect(retried.product.stockQuantity.toString()).toBe(after.product.stockQuantity.toString());
    expect(retried.ledger).toEqual(after.ledger);
    expect(retried.payments).toEqual(after.payments);
  }, 90_000);
});
