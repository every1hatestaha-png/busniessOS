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
let workspaceId = "";
let cashId = "";
let productId = "";
let menuItemId = "";
const actor = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });

async function state(orderId: string, paymentId: string) {
  const [returns, items, allocations, payment, order, cash, product, ledgerCount, inventoryTxCount] = await Promise.all([
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "id"::text, "reason", "total"::text, "inventoryCost"::text,
             "idempotencyKey", "requestFingerprint", "createdById", "createdAt"::text,
             "isReversal", "reversalOfId"::text, "reversalReason"
      FROM "restaurant_returns"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT rri."id"::text, rri."restaurantReturnId"::text, rri."quantity"::text,
             rri."total"::text, rri."inventoryCost"::text, rri."restocked", rri."isReversal"
      FROM "restaurant_return_items" rri
      INNER JOIN "restaurant_returns" rr ON rr."id"=rri."restaurantReturnId"
      WHERE rr."workspaceId"=${workspaceId}::uuid AND rr."restaurantOrderId"=${orderId}::uuid
      ORDER BY rri."createdAt", rri."id"
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT a."id"::text, a."restaurantReturnId"::text, a."restaurantPaymentId"::text,
             a."amount"::text, a."isReversal"
      FROM "restaurant_return_payment_allocations" a
      INNER JOIN "restaurant_returns" rr ON rr."id"=a."restaurantReturnId"
      WHERE rr."workspaceId"=${workspaceId}::uuid AND rr."restaurantOrderId"=${orderId}::uuid
      ORDER BY a."createdAt", a."id"
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "voidedAt"::text, "voidedById", "voidReason" FROM "restaurant_payments"
      WHERE "id"=${paymentId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "paymentStatus" FROM "restaurant_orders"
      WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId }, select: { currentBalance: true } }),
    db.product.findUniqueOrThrow({ where: { id: productId }, select: { stockQuantity: true } }),
    db.generalLedgerEntry.count({ where: { workspaceId } }),
    db.inventoryTransaction.count({ where: { workspaceId, productId } }),
  ]);
  return {
    returns,
    items,
    allocations,
    payment,
    order,
    cash: cash.currentBalance.toString(),
    stock: product.stockQuantity.toString(),
    ledgerCount,
    inventoryTxCount,
  };
}

describe("restaurant V1.32 immutable return snapshots", () => {
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

    const user = await db.user.create({ data: { clerkId: `v132-${runId}`, email: `v132-${runId}@example.invalid` } });
    ownerId = user.id;
    const workspace = await db.workspace.create({
      data: { name: `Return snapshots ${runId}`, vertical: "LEGACY", members: { create: { userId: ownerId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(actor(), {
      name: "V1.32 drawer", openingBalance: 1000, isBank: false,
      bankName: "", accountTitle: "", accountNumber: "", notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceId)).find((row) => row.id === cash.id)!.cashBankAccountId;
    const { openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts");
    await openRestaurantCashShiftSafely(actor(), 0, "V1.84 return-snapshot shift");

    const product = await db.product.create({
      data: { workspaceId, name: "V1.32 meal", sku: `V132-${runId}`, stockQuantity: 100, costPrice: 50, sellingPrice: 200 },
    });
    productId = product.id;
    const category = await createCategory(actor(), { name: `V1.32 ${runId}` });
    const menuItem = await createMenuItem(actor(), { categoryId: category.id, productId, name: "V1.32 meal", price: 200 });
    menuItemId = menuItem.id;
  }, 60_000);

  afterAll(async () => {
    // Immutable financial fixtures live until the isolated test database is discarded.
    // Never delete their parents or disable history guards during teardown.
    if (db) await db.$disconnect();
  }, 60_000);

  it("permits only creation-transaction inventory-cost finalization and rejects later history rewrites", async () => {
    const order = await createOrder(actor(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 2 }] });
    const payment = await collect(actor(), {
      orderId: order.id, cashBankAccountId: cashId, method: "CASH", amount: 400,
      idempotencyKey: `pay:${randomUUID()}`,
    });
    for (const status of ["PREPARING", "READY", "COMPLETED"] as const) await transition(actor(), order.id, status);

    const orderItems = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items"
      WHERE "restaurantOrderId"=${order.id}::uuid ORDER BY "createdAt", "id" LIMIT 1
    `;
    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const created = await createReturn(actor(), {
      orderId: order.id,
      reason: "Unopened item returned",
      idempotencyKey: `return:${randomUUID()}`,
      items: [{ orderItemId: orderItems[0]!.id, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });

    const parent = await db.$queryRaw<Array<{ inventoryCost: string }>>`
      SELECT "inventoryCost"::text AS "inventoryCost" FROM "restaurant_returns" WHERE "id"=${created.id}::uuid
    `;
    expect(parent).toEqual([{ inventoryCost: "50.00" }]);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toString())
      .toBe(stockBefore.stockQuantity.plus(1).toString());

    const children = await db.$queryRaw<Array<{ itemId: string; allocationId: string }>>`
      SELECT i."id"::text AS "itemId", a."id"::text AS "allocationId"
      FROM "restaurant_return_items" i
      CROSS JOIN "restaurant_return_payment_allocations" a
      WHERE i."restaurantReturnId"=${created.id}::uuid AND a."restaurantReturnId"=${created.id}::uuid LIMIT 1
    `;
    const before = await state(order.id, payment.id);
    const { itemId, allocationId } = children[0]!;

    const attempts = [
      () => db.$executeRaw`UPDATE "restaurant_returns" SET "inventoryCost"="inventoryCost" + 1 WHERE "id"=${created.id}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_returns" SET "total"="total" + 1 WHERE "id"=${created.id}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_returns" SET "reason"='tampered history' WHERE "id"=${created.id}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_return_items" SET "quantity"="quantity" + 1 WHERE "id"=${itemId}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_return_items" SET "restocked"=false WHERE "id"=${itemId}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_return_payment_allocations" SET "amount"="amount" + 1 WHERE "id"=${allocationId}::uuid`,
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toThrow(/Restaurant return/);
      expect(await state(order.id, payment.id)).toEqual(before);
    }

    await expect(db.$executeRaw`UPDATE "restaurant_returns" SET "reason"="reason" WHERE "id"=${created.id}::uuid`).resolves.toBe(1);
    await expect(db.$executeRaw`UPDATE "restaurant_return_items" SET "quantity"="quantity" WHERE "id"=${itemId}::uuid`).resolves.toBe(1);
    await expect(db.$executeRaw`UPDATE "restaurant_return_payment_allocations" SET "amount"="amount" WHERE "id"=${allocationId}::uuid`).resolves.toBe(1);

    const reversal = await reverseReturn(actor(), created.id, "Return entered in error");
    expect(reversal.alreadyReversed).toBe(false);
    const reversed = await state(order.id, payment.id);
    expect(reversed.returns).toHaveLength(2);
    expect(reversed.items).toHaveLength(2);
    expect(reversed.allocations).toHaveLength(2);

    const reversalRow = reversed.returns.find((row) => row.isReversal === true)!;
    await expect(
      db.$executeRaw`UPDATE "restaurant_returns" SET "inventoryCost"="inventoryCost" - 1 WHERE "id"=${String(reversalRow.id)}::uuid`,
    ).rejects.toThrow("Restaurant return snapshot is immutable");
    expect(await state(order.id, payment.id)).toEqual(reversed);

    expect(await reverseReturn(actor(), created.id, "Return entered in error"))
      .toMatchObject({ id: reversal.id, alreadyReversed: true });
    expect(await state(order.id, payment.id)).toEqual(reversed);
  }, 60_000);
});
