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
let createRestaurantItemReturn: typeof import("@/lib/server/restaurant-item-returns")["createRestaurantItemReturn"];
let reverseRestaurantItemReturn: typeof import("@/lib/server/restaurant-return-reversals")["reverseRestaurantItemReturn"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let productId = "";
let menuItemId = "";
let cashBankAccountId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

async function enableRestaurant() {
  await db.$executeRaw`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    ON CONFLICT ("workspaceId", "moduleKey") DO UPDATE SET "enabled"=true, "updatedAt"=now()
  `;
}

async function completeOrder(orderId: string) {
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "PREPARING");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "READY");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "COMPLETED");
}

async function firstOrderItem(orderId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id" FROM "restaurant_order_items"
    WHERE "restaurantOrderId"=${orderId}::uuid ORDER BY "createdAt", "id" LIMIT 1
  `;
  return rows[0]!.id;
}

describe("restaurant V1.4 immutable return reversal", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity, recordRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ createRestaurantItemReturn } = await import("@/lib/server/restaurant-item-returns"));
    ({ reverseRestaurantItemReturn } = await import("@/lib/server/restaurant-return-reversals"));

    const user = await db.user.create({ data: { clerkId: `restaurant-reversal-${runId}`, email: `restaurant-reversal-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Restaurant Reversal ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await enableRestaurant();

    const cash = await createCashBankAccount(owner(), { name: "Reversal Cash", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" });
    const accounts = await getCashBankAccounts(workspaceId);
    cashBankAccountId = accounts.find((account) => account.id === cash.id)!.cashBankAccountId;
    const { openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts");
    await openRestaurantCashShiftSafely(owner(), 0, "V1.84 return reversal shift");

    const product = await db.product.create({ data: { workspaceId, name: "Reversal Drink", sku: `REV-${runId}`, stockQuantity: 20, costPrice: 50, sellingPrice: 200 } });
    productId = product.id;
    const category = await createRestaurantMenuCategory(owner(), { name: "Reversal Menu" });
    const menuItem = await createRestaurantMenuItem(owner(), { categoryId: category.id, productId, name: "Reversal Drink", price: 200 });
    menuItemId = menuItem.id;
  }, 60_000);

  afterAll(async () => {
    // Immutable financial fixtures live until the isolated test database is discarded.
    // Never delete their parents or disable history guards during teardown.
    if (db) await db.$disconnect();
  }, 60_000);

  it("reverses a fully refunded restocked return and restores the pre-return financial state", async () => {
    const order = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    const payment = await recordRestaurantPayment(owner(), { orderId: order.id, cashBankAccountId, method: "CASH", amount: 200, idempotencyKey: `v14:${runId}:payment-a` });
    await completeOrder(order.id);
    const orderItemId = await firstOrderItem(order.id);

    const stockAfterSale = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const cashAfterSale = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } });
    const returned = await createRestaurantItemReturn(owner(), {
      orderId: order.id,
      reason: "Unopened drink returned",
      idempotencyKey: `v14:${runId}:return-a`,
      items: [{ orderItemId, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });

    const stockAfterReturn = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const cashAfterReturn = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } });
    expect(Number(stockAfterReturn.stockQuantity) - Number(stockAfterSale.stockQuantity)).toBe(1);
    expect(Number(cashAfterSale.currentBalance) - Number(cashAfterReturn.currentBalance)).toBe(200);

    const reversed = await reverseRestaurantItemReturn(owner(), returned.id, "Return was entered against the wrong order");
    const retry = await reverseRestaurantItemReturn(owner(), returned.id, "Return was entered against the wrong order");
    expect(retry).toMatchObject({ id: reversed.id, alreadyReversed: true });

    const [stockAfterReversal, cashAfterReversal, paymentRows, orderRows, totals, reversalRows, audits, glReversals] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } }),
      db.$queryRaw<Array<{ voidedAt: Date | null }>>`SELECT "voidedAt" FROM "restaurant_payments" WHERE "id"=${payment.id}::uuid`,
      db.$queryRaw<Array<{ paymentStatus: string }>>`SELECT "paymentStatus" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid`,
      db.$queryRaw<Array<{ total: unknown; allocated: unknown; quantity: unknown }>>`
        SELECT
          COALESCE((SELECT SUM("total") FROM "restaurant_returns" WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${order.id}::uuid),0) AS "total",
          COALESCE((SELECT SUM(a."amount") FROM "restaurant_return_payment_allocations" a INNER JOIN "restaurant_returns" r ON r."id"=a."restaurantReturnId" WHERE r."workspaceId"=${workspaceId}::uuid AND r."restaurantOrderId"=${order.id}::uuid),0) AS "allocated",
          COALESCE((SELECT SUM(i."quantity") FROM "restaurant_return_items" i INNER JOIN "restaurant_returns" r2 ON r2."id"=i."restaurantReturnId" WHERE r2."workspaceId"=${workspaceId}::uuid AND r2."restaurantOrderId"=${order.id}::uuid),0) AS "quantity"
      `,
      db.$queryRaw<Array<{ isReversal: boolean; reversalOfId: string | null }>>`SELECT "isReversal", "reversalOfId"::text AS "reversalOfId" FROM "restaurant_returns" WHERE "id"=${reversed.id}::uuid`,
      db.auditLog.findMany({ where: { workspaceId, action: "restaurant.return.reversed", entityId: reversed.id } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, reversalOfId: { not: null }, reversalReason: { contains: "Reversed restaurant return" } } }),
    ]);

    expect(Number(stockAfterReversal.stockQuantity)).toBe(Number(stockAfterSale.stockQuantity));
    expect(Number(cashAfterReversal.currentBalance)).toBe(Number(cashAfterSale.currentBalance));
    expect(paymentRows[0]?.voidedAt).toBeNull();
    expect(orderRows[0]?.paymentStatus).toBe("PAID");
    expect(Number(totals[0]?.total)).toBe(0);
    expect(Number(totals[0]?.allocated)).toBe(0);
    expect(Number(totals[0]?.quantity)).toBe(0);
    expect(reversalRows[0]).toMatchObject({ isReversal: true, reversalOfId: returned.id });
    expect(audits).toHaveLength(1);
    expect(glReversals.length).toBeGreaterThanOrEqual(2);
  });

  it("fails closed when stock restored by the original return has already been consumed", async () => {
    const order = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    const payment = await recordRestaurantPayment(owner(), { orderId: order.id, cashBankAccountId, method: "CASH", amount: 200, idempotencyKey: `v14:${runId}:payment-b` });
    await completeOrder(order.id);
    const orderItemId = await firstOrderItem(order.id);
    const returned = await createRestaurantItemReturn(owner(), {
      orderId: order.id,
      reason: "Restock then consume test",
      idempotencyKey: `v14:${runId}:return-b`,
      items: [{ orderItemId, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });

    await db.product.update({ where: { id: productId }, data: { stockQuantity: 0 } });
    await expect(reverseRestaurantItemReturn(owner(), returned.id, "Cannot safely reverse consumed stock"))
      .rejects.toThrow("Restocked inventory from this return has already been consumed");

    const reversals = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_returns"
      WHERE "workspaceId"=${workspaceId}::uuid AND "reversalOfId"=${returned.id}::uuid
    `;
    expect(reversals[0]?.count).toBe(0);
  });
});
