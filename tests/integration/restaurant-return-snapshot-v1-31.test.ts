import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let createReturn: typeof import("@/lib/server/restaurant-item-returns")["createRestaurantItemReturn"];
let reverseReturn: typeof import("@/lib/server/restaurant-return-reversals")["reverseRestaurantItemReturn"];

const runId = randomUUID();
let ownerId = "";
let managerId = "";
let workspaceId = "";
let cashId = "";
let productId = "";
let menuItemId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });
const manager = () => ({ workspaceId, userId: managerId, role: "MANAGER" as const });

async function snapshot(orderId: string, paymentId: string) {
  const [returns, items, allocations, payment, order, cash, ledgerCount, product] = await Promise.all([
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "id"::text, "workspaceId"::text, "restaurantOrderId"::text, "returnNumber", "reason",
             "subtotal"::text, "discountAmount"::text, "taxAmount"::text, "total"::text,
             "inventoryCost"::text, "idempotencyKey", "requestFingerprint", "createdById",
             "createdAt"::text, "isReversal", "reversalOfId"::text, "reversalReason"
      FROM "restaurant_returns"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT rri."id"::text, rri."workspaceId"::text, rri."restaurantReturnId"::text,
             rri."restaurantOrderItemId"::text, rri."quantity"::text, rri."subtotal"::text,
             rri."discountAmount"::text, rri."taxAmount"::text, rri."total"::text,
             rri."inventoryCost"::text, rri."restocked", rri."createdAt"::text, rri."isReversal"
      FROM "restaurant_return_items" rri
      INNER JOIN "restaurant_returns" rr ON rr."id"=rri."restaurantReturnId"
      WHERE rr."workspaceId"=${workspaceId}::uuid AND rr."restaurantOrderId"=${orderId}::uuid
      ORDER BY rri."createdAt", rri."id"
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT a."id"::text, a."workspaceId"::text, a."restaurantReturnId"::text,
             a."restaurantPaymentId"::text, a."amount"::text, a."createdAt"::text, a."isReversal"
      FROM "restaurant_return_payment_allocations" a
      INNER JOIN "restaurant_returns" rr ON rr."id"=a."restaurantReturnId"
      WHERE rr."workspaceId"=${workspaceId}::uuid AND rr."restaurantOrderId"=${orderId}::uuid
      ORDER BY a."createdAt", a."id"
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "id"::text, "amount"::text, "postedAt"::text, "voidedAt"::text, "voidedById", "voidReason"
      FROM "restaurant_payments" WHERE "id"=${paymentId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "paymentStatus", "status", "inventoryPostedAt"::text, "accountingPostedAt"::text
      FROM "restaurant_orders" WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId }, select: { currentBalance: true } }),
    db.generalLedgerEntry.count({ where: { workspaceId } }),
    db.product.findUniqueOrThrow({ where: { id: productId }, select: { stockQuantity: true } }),
  ]);

  return {
    returns,
    items,
    allocations,
    payment,
    order,
    cash: cash.currentBalance.toString(),
    ledgerCount,
    stock: product.stockQuantity.toString(),
  };
}

describe("restaurant V1.31 immutable return financial snapshots", () => {
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
    ({ reverseRestaurantItemReturn: reverseReturn } = await import("@/lib/server/restaurant-return-reversals"));
    const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");

    const [ownerUser, managerUser] = await Promise.all([
      db.user.create({ data: { clerkId: `v131-owner-${runId}`, email: `v131-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `v131-manager-${runId}`, email: `v131-manager-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    managerId = managerUser.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Return snapshots ${runId}`,
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
      name: "V1.31 drawer",
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
    const menuItem = await createMenuItem(owner(), {
      categoryId: category.id,
      productId,
      name: "V1.31 meal",
      price: 200,
    });
    menuItemId = menuItem.id;
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

  it("rejects return, line, and allocation rewrites while preserving compensating reversal", async () => {
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

    const orderItems = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items"
      WHERE "restaurantOrderId"=${order.id}::uuid ORDER BY "createdAt", "id" LIMIT 1
    `;
    const created = await createReturn(manager(), {
      orderId: order.id,
      reason: "Customer returned one item",
      idempotencyKey: `return:${randomUUID()}`,
      items: [{ orderItemId: orderItems[0]!.id, quantity: 1, restock: false }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });

    const children = await db.$queryRaw<Array<{ itemId: string; allocationId: string }>>`
      SELECT rri."id"::text AS "itemId", a."id"::text AS "allocationId"
      FROM "restaurant_return_items" rri
      CROSS JOIN "restaurant_return_payment_allocations" a
      WHERE rri."restaurantReturnId"=${created.id}::uuid
        AND a."restaurantReturnId"=${created.id}::uuid
      LIMIT 1
    `;
    const { itemId, allocationId } = children[0]!;
    const before = await snapshot(order.id, payment.id);

    const mutations: Array<{ run: () => Promise<unknown>; message: string }> = [
      { run: () => db.$executeRaw`UPDATE "restaurant_returns" SET "total"="total" + 1 WHERE "id"=${created.id}::uuid`, message: "Restaurant return snapshot is immutable" },
      { run: () => db.$executeRaw`UPDATE "restaurant_returns" SET "reason"='Tampered historical reason' WHERE "id"=${created.id}::uuid`, message: "Restaurant return snapshot is immutable" },
      { run: () => db.$executeRaw`UPDATE "restaurant_returns" SET "createdById"=${ownerId} WHERE "id"=${created.id}::uuid`, message: "Restaurant return snapshot is immutable" },
      { run: () => db.$executeRaw`UPDATE "restaurant_returns" SET "requestFingerprint"=${randomUUID()} WHERE "id"=${created.id}::uuid`, message: "Restaurant return snapshot is immutable" },
      { run: () => db.$executeRaw`UPDATE "restaurant_return_items" SET "quantity"="quantity" + 1 WHERE "id"=${itemId}::uuid`, message: "Restaurant return item snapshot is immutable" },
      { run: () => db.$executeRaw`UPDATE "restaurant_return_items" SET "restocked"=NOT "restocked" WHERE "id"=${itemId}::uuid`, message: "Restaurant return item snapshot is immutable" },
      { run: () => db.$executeRaw`UPDATE "restaurant_return_items" SET "total"="total" + 1 WHERE "id"=${itemId}::uuid`, message: "Restaurant return item snapshot is immutable" },
      { run: () => db.$executeRaw`UPDATE "restaurant_return_payment_allocations" SET "amount"="amount" + 1 WHERE "id"=${allocationId}::uuid`, message: "Restaurant return payment allocation snapshot is immutable" },
      { run: () => db.$executeRaw`UPDATE "restaurant_return_payment_allocations" SET "isReversal"=true WHERE "id"=${allocationId}::uuid`, message: "Restaurant return payment allocation snapshot is immutable" },
    ];

    for (const mutation of mutations) {
      await expect(mutation.run()).rejects.toThrow(mutation.message);
      expect(await snapshot(order.id, payment.id)).toEqual(before);
    }

    // Harmless no-op UPDATEs remain valid so database maintenance that does not
    // change history is not needlessly broken.
    await expect(db.$executeRaw`UPDATE "restaurant_returns" SET "reason"="reason" WHERE "id"=${created.id}::uuid`).resolves.toBe(1);
    await expect(db.$executeRaw`UPDATE "restaurant_return_items" SET "quantity"="quantity" WHERE "id"=${itemId}::uuid`).resolves.toBe(1);
    await expect(db.$executeRaw`UPDATE "restaurant_return_payment_allocations" SET "amount"="amount" WHERE "id"=${allocationId}::uuid`).resolves.toBe(1);

    const reversal = await reverseReturn(owner(), created.id, "Return was entered in error");
    expect(reversal.alreadyReversed).toBe(false);
    const afterReversal = await snapshot(order.id, payment.id);
    expect(afterReversal.returns).toHaveLength(2);
    expect(afterReversal.items).toHaveLength(2);
    expect(afterReversal.allocations).toHaveLength(2);

    const reversalRow = afterReversal.returns.find((row) => row.isReversal === true)!;
    await expect(
      db.$executeRaw`UPDATE "restaurant_returns" SET "total"="total" - 1 WHERE "id"=${String(reversalRow.id)}::uuid`,
    ).rejects.toThrow("Restaurant return snapshot is immutable");
    expect(await snapshot(order.id, payment.id)).toEqual(afterReversal);

    const retry = await reverseReturn(owner(), created.id, "Return was entered in error");
    expect(retry).toMatchObject({ id: reversal.id, alreadyReversed: true });
    expect(await snapshot(order.id, payment.id)).toEqual(afterReversal);
  }, 60_000);
});
