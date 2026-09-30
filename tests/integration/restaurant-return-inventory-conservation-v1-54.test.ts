import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let recordPayment: typeof import("@/lib/server/restaurant-integrity")["recordRestaurantPayment"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let createItemReturn: typeof import("@/lib/server/restaurant-item-returns")["createRestaurantItemReturn"];
let reverseItemReturn: typeof import("@/lib/server/restaurant-return-reversals")["reverseRestaurantItemReturn"];

const runId = randomUUID();
let ownerId = "";
let workspaceId = "";
let recipeId = "";
let ingredientProductId = "";
let menuItemId = "";
let cashBankAccountId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });

async function movementQuantity(returnId: string) {
  const rows = await db.$queryRaw<Array<{ quantity: string }>>`
    SELECT "quantity"::text AS "quantity"
    FROM "restaurant_return_inventory_movements"
    WHERE "workspaceId"=${workspaceId}::uuid
      AND "restaurantReturnId"=${returnId}::uuid
      AND "productId"=${ingredientProductId}
    ORDER BY "id"
  `;
  expect(rows).toHaveLength(1);
  return rows[0]!.quantity;
}

describe("restaurant V1.54 return inventory conservation", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ transitionRestaurantOrderWithIntegrity: transition, recordRestaurantPayment: recordPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ createRestaurantMenuCategory: createCategory, createRestaurantMenuItem: createMenuItem, createPosRestaurantOrder: createOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ createRestaurantItemReturn: createItemReturn } = await import("@/lib/server/restaurant-item-returns"));
    ({ reverseRestaurantItemReturn: reverseItemReturn } = await import("@/lib/server/restaurant-return-reversals"));

    const user = await db.user.create({ data: { clerkId: `v154-owner-${runId}`, email: `v154-owner-${runId}@example.invalid` } });
    ownerId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Return conservation ${runId}`, vertical: "LEGACY", members: { create: { userId: ownerId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await db.$executeRaw`INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt") VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())`;

    await ensureDefaultAccounts(workspaceId);
    const cashGl = await db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "CASH_IN_HAND" } } });
    const cashBank = await db.cashBankAccount.create({ data: { workspaceId, accountId: cashGl.id, name: `V154 cash ${runId}`, openingBalance: 1000, currentBalance: 1000, isBank: false, isActive: true } });
    cashBankAccountId = cashBank.id;

    const [finishedProduct, ingredientProduct] = await Promise.all([
      db.product.create({ data: { workspaceId, name: "V154 fractional meal", sku: `V154-F-${runId}`, stockQuantity: 0, costPrice: 0, sellingPrice: 100 } }),
      db.product.create({ data: { workspaceId, name: "V154 ingredient", sku: `V154-I-${runId}`, stockQuantity: 10, costPrice: 3, sellingPrice: 0 } }),
    ]);
    ingredientProductId = ingredientProduct.id;
    const recipeRows = await db.$queryRaw<Array<{ id: string }>>`INSERT INTO "recipes" ("workspaceId", "finishedProductId", "yieldQuantity", "isActive") VALUES (${workspaceId}::uuid, ${finishedProduct.id}::uuid, 3.0000, true) RETURNING "id"::text AS "id"`;
    recipeId = recipeRows[0]!.id;
    await db.$executeRaw`INSERT INTO "recipe_items" ("recipeId", "ingredientProductId", "quantity", "wastagePercent") VALUES (${recipeId}::uuid, ${ingredientProductId}::uuid, 1.0000, 0)`;

    const category = await createCategory(owner(), { name: `V154 ${runId}` });
    const menuItem = await createMenuItem(owner(), { categoryId: category.id, productId: finishedProduct.id, name: "V154 fractional meal", price: 100 });
    menuItemId = menuItem.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "restaurant_return_inventory_movements" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_return_payment_allocations" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_return_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_returns" WHERE "workspaceId"=${workspaceId}::uuid`;
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
    await db.$executeRaw`DELETE FROM "recipe_items" WHERE "recipeId"=${recipeId}::uuid`;
    await db.$executeRaw`DELETE FROM "recipes" WHERE "id"=${recipeId}::uuid`;
    await db.product.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: ownerId } });
    await db.$disconnect();
  }, 60_000);

  it("conserves 4dp stock across repeated partial restocks and reverses the exact posted movement", async () => {
    const order = await createOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 3 }] });
    const recordedPayment = await recordPayment(owner(), { orderId: order.id, cashBankAccountId, method: "CASH", amount: 300, idempotencyKey: `v154-payment-${runId}` });
    const paymentId = recordedPayment.id;
    await transition(owner(), order.id, "PREPARING");
    await transition(owner(), order.id, "READY");
    await transition(owner(), order.id, "COMPLETED");

    const orderItems = await db.$queryRaw<Array<{ id: string }>>`SELECT "id"::text AS "id" FROM "restaurant_order_items" WHERE "restaurantOrderId"=${order.id}::uuid`;
    const orderItemId = orderItems[0]!.id;
    const afterCompletion = await db.product.findUniqueOrThrow({ where: { id: ingredientProductId } });
    expect(afterCompletion.stockQuantity.toFixed(4)).toBe("9.0000");

    const makeReturn = (key: string) => createItemReturn(owner(), {
      orderId: order.id,
      reason: `V1.54 partial return ${key}`,
      idempotencyKey: `v154-${key}-${runId}`,
      items: [{ orderItemId, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId, amount: 100 }],
    });

    const first = await makeReturn("first");
    expect(await movementQuantity(first.id)).toBe("0.3333");
    const second = await makeReturn("second");
    expect(await movementQuantity(second.id)).toBe("0.3334");
    const reversal = await reverseItemReturn(owner(), second.id, "Verify exact partial-restock reversal");
    expect(await movementQuantity(reversal.id)).toBe("-0.3334");
    const replacement = await makeReturn("replacement");
    expect(await movementQuantity(replacement.id)).toBe("0.3334");
    const third = await makeReturn("third");
    expect(await movementQuantity(third.id)).toBe("0.3333");

    const finalProduct = await db.product.findUniqueOrThrow({ where: { id: ingredientProductId } });
    expect(finalProduct.stockQuantity.toFixed(4)).toBe("10.0000");
    const movementTotals = await db.$queryRaw<Array<{ total: Prisma.Decimal }>>`SELECT COALESCE(SUM("quantity"), 0)::numeric AS "total" FROM "restaurant_return_inventory_movements" WHERE "workspaceId"=${workspaceId}::uuid AND "productId"=${ingredientProductId}`;
    expect(new Prisma.Decimal(movementTotals[0]!.total).toFixed(4)).toBe("1.0000");

    const returnInventoryTransactions = await db.inventoryTransaction.findMany({ where: { workspaceId, productId: ingredientProductId, OR: [{ reference: { startsWith: "RESTAURANT_RETURN:" } }, { reference: { startsWith: "RESTAURANT_RETURN_REVERSAL:" } }] } });
    const transactionTotal = returnInventoryTransactions.reduce((sum, row) => sum.plus(row.quantityChanged), new Prisma.Decimal(0));
    expect(transactionTotal.toFixed(4)).toBe("1.0000");

    const payment = await db.$queryRaw<Array<{ voidedAt: Date | null; voidReason: string | null }>>`SELECT "voidedAt", "voidReason" FROM "restaurant_payments" WHERE "id"=${paymentId}::uuid AND "workspaceId"=${workspaceId}::uuid`;
    expect(payment[0]!.voidedAt).not.toBeNull();
    expect(payment[0]!.voidReason).toContain(third.returnNumber);
  }, 120_000);
});
