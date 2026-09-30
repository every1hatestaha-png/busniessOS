import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let createReturn: typeof import("@/lib/server/restaurant-item-returns")["createRestaurantItemReturn"];

const runId = randomUUID();
let ownerId = "";
let managerId = "";
let workspaceId = "";
let cashId = "";
let productId = "";
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

async function returnState(orderId: string, paymentId: string, orderItemId: string) {
  const [returns, returnedItems, allocations, paymentRows, orderRows, cash, product, ledgerCount, inventoryTxCount] = await Promise.all([
    db.$queryRaw<Array<{ id: string; isReversal: boolean; total: string; idempotencyKey: string | null }>>`
      SELECT "id"::text AS "id", "isReversal", "total"::text AS "total", "idempotencyKey"
      FROM "restaurant_returns"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<{ quantity: string; total: string; restocked: boolean }>>`
      SELECT rri."quantity"::text AS "quantity", rri."total"::text AS "total", rri."restocked"
      FROM "restaurant_return_items" rri
      INNER JOIN "restaurant_returns" rr ON rr."id"=rri."restaurantReturnId"
      WHERE rr."workspaceId"=${workspaceId}::uuid
        AND rr."restaurantOrderId"=${orderId}::uuid
        AND rri."restaurantOrderItemId"=${orderItemId}::uuid
      ORDER BY rr."createdAt", rr."id", rri."id"
    `,
    db.$queryRaw<Array<{ amount: string }>>`
      SELECT "amount"::text AS "amount"
      FROM "restaurant_return_payment_allocations"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantPaymentId"=${paymentId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<{ voidedAt: Date | null }>>`
      SELECT "voidedAt" FROM "restaurant_payments"
      WHERE "workspaceId"=${workspaceId}::uuid AND "id"=${paymentId}::uuid
    `,
    db.$queryRaw<Array<{ paymentStatus: string }>>`
      SELECT "paymentStatus" FROM "restaurant_orders"
      WHERE "workspaceId"=${workspaceId}::uuid AND "id"=${orderId}::uuid
    `,
    db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId } }),
    db.product.findUniqueOrThrow({ where: { id: productId } }),
    db.generalLedgerEntry.count({ where: { workspaceId } }),
    db.inventoryTransaction.count({ where: { workspaceId, productId } }),
  ]);

  return {
    returns,
    returnedItems,
    allocations,
    payment: paymentRows[0]!,
    paymentStatus: orderRows[0]!.paymentStatus,
    cash,
    product,
    ledgerCount,
    inventoryTxCount,
    netReturnedQty: returnedItems.reduce((sum, item) => sum + Number(item.quantity), 0),
    netAllocated: allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0),
  };
}

function returnInput(receipt: Awaited<ReturnType<typeof completedPaidOrder>>, params: {
  quantity: number;
  amount: number;
  idempotencyKey: string;
  reason: string;
}) {
  return {
    orderId: receipt.orderId,
    reason: params.reason,
    idempotencyKey: params.idempotencyKey,
    items: [{ orderItemId: receipt.orderItemId, quantity: params.quantity, restock: true }],
    paymentAllocations: [{ paymentId: receipt.paymentId, amount: params.amount }],
  };
}

describe("restaurant V1.31 item-return concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createOrder,
    } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity: transition } = await import("@/lib/server/restaurant-integrity"));
    ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ createRestaurantItemReturn: createReturn } = await import("@/lib/server/restaurant-item-returns"));
    const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");

    const [ownerUser, managerUser] = await Promise.all([
      db.user.create({ data: { clerkId: `v131-owner-${runId}`, email: `v131-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `v131-manager-${runId}`, email: `v131-manager-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    managerId = managerUser.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Item return concurrency ${runId}`,
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

    const createdCash = await createCashBankAccount(owner(), {
      name: "V1.31 returns drawer",
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
        name: "V1.31 meal",
        sku: `V131-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    productId = product.id;
    const category = await createCategory(owner(), { name: `V1.31 ${runId}` });
    const item = await createMenuItem(owner(), {
      categoryId: category.id,
      productId,
      name: "V1.31 meal",
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

  it("prevents two simultaneous full returns from over-returning quantity, cash or stock", async () => {
    const receipt = await completedPaidOrder();
    const before = await returnState(receipt.orderId, receipt.paymentId, receipt.orderItemId);

    const [first, second] = await Promise.allSettled([
      createReturn(owner(), returnInput(receipt, {
        quantity: 2,
        amount: 400,
        idempotencyKey: `return:${randomUUID()}`,
        reason: "Concurrent full return A",
      })),
      createReturn(manager(), returnInput(receipt, {
        quantity: 2,
        amount: 400,
        idempotencyKey: `return:${randomUUID()}`,
        reason: "Concurrent full return B",
      })),
    ]);

    expect([first, second].filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect([first, second].filter((result) => result.status === "rejected")).toHaveLength(1);

    const after = await returnState(receipt.orderId, receipt.paymentId, receipt.orderItemId);
    expect(after.returns.filter((row) => !row.isReversal)).toHaveLength(1);
    expect(after.netReturnedQty).toBe(2);
    expect(after.netAllocated).toBe(400);
    expect(after.payment.voidedAt).not.toBeNull();
    expect(after.paymentStatus).toBe("UNPAID");
    expect(after.cash.currentBalance.toString()).toBe(before.cash.currentBalance.minus(400).toString());
    expect(after.product.stockQuantity.toString()).toBe(before.product.stockQuantity.plus(2).toString());
  }, 60_000);

  it("accepts two simultaneous half returns exactly once each and settles the original payment", async () => {
    const receipt = await completedPaidOrder();
    const before = await returnState(receipt.orderId, receipt.paymentId, receipt.orderItemId);

    const [first, second] = await Promise.all([
      createReturn(owner(), returnInput(receipt, {
        quantity: 1,
        amount: 200,
        idempotencyKey: `return:${randomUUID()}`,
        reason: "Concurrent half return A",
      })),
      createReturn(manager(), returnInput(receipt, {
        quantity: 1,
        amount: 200,
        idempotencyKey: `return:${randomUUID()}`,
        reason: "Concurrent half return B",
      })),
    ]);

    expect(first.id).not.toBe(second.id);
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(false);

    const after = await returnState(receipt.orderId, receipt.paymentId, receipt.orderItemId);
    expect(after.returns.filter((row) => !row.isReversal)).toHaveLength(2);
    expect(after.netReturnedQty).toBe(2);
    expect(after.netAllocated).toBe(400);
    expect(after.payment.voidedAt).not.toBeNull();
    expect(after.paymentStatus).toBe("UNPAID");
    expect(after.cash.currentBalance.toString()).toBe(before.cash.currentBalance.minus(400).toString());
    expect(after.product.stockQuantity.toString()).toBe(before.product.stockQuantity.plus(2).toString());
  }, 60_000);

  it("deduplicates simultaneous identical returns with the same request ID", async () => {
    const receipt = await completedPaidOrder();
    const before = await returnState(receipt.orderId, receipt.paymentId, receipt.orderItemId);
    const idempotencyKey = `return:${randomUUID()}`;
    const input = returnInput(receipt, {
      quantity: 1,
      amount: 200,
      idempotencyKey,
      reason: "Duplicate tap item return",
    });

    const [first, second] = await Promise.all([
      createReturn(owner(), input),
      createReturn(manager(), input),
    ]);

    expect(first.id).toBe(second.id);
    expect([first.idempotent, second.idempotent].sort()).toEqual([false, true]);

    const after = await returnState(receipt.orderId, receipt.paymentId, receipt.orderItemId);
    expect(after.returns.filter((row) => !row.isReversal)).toHaveLength(1);
    expect(after.returns[0]!.idempotencyKey).toBe(idempotencyKey);
    expect(after.netReturnedQty).toBe(1);
    expect(after.netAllocated).toBe(200);
    expect(after.payment.voidedAt).toBeNull();
    expect(after.paymentStatus).toBe("PARTIALLY_PAID");
    expect(after.cash.currentBalance.toString()).toBe(before.cash.currentBalance.minus(200).toString());
    expect(after.product.stockQuantity.toString()).toBe(before.product.stockQuantity.plus(1).toString());

    const retry = await createReturn(owner(), input);
    expect(retry).toMatchObject({ id: first.id, idempotent: true });
    const retried = await returnState(receipt.orderId, receipt.paymentId, receipt.orderItemId);
    expect(retried.returns).toEqual(after.returns);
    expect(retried.returnedItems).toEqual(after.returnedItems);
    expect(retried.allocations).toEqual(after.allocations);
    expect(retried.cash.currentBalance.toString()).toBe(after.cash.currentBalance.toString());
    expect(retried.product.stockQuantity.toString()).toBe(after.product.stockQuantity.toString());
    expect(retried.ledgerCount).toBe(after.ledgerCount);
    expect(retried.inventoryTxCount).toBe(after.inventoryTxCount);
  }, 60_000);
});