import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRecipe: typeof import("@/lib/server/industry-modules")["createRecipe"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transitionRestaurantOrderWithIntegrity: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let recordRestaurantPayment: typeof import("@/lib/server/restaurant-integrity")["recordRestaurantPayment"];
let voidRestaurantPayment: typeof import("@/lib/server/restaurant-integrity")["voidRestaurantPayment"];

const runId = randomUUID();
let userA = "";
let userB = "";
let workspaceA = "";
let workspaceB = "";
let ingredientProductId = "";
let directProductId = "";
let lowStockProductId = "";
let recipeMenuItemId = "";
let directMenuItemId = "";
let lowStockMenuItemId = "";
let cashAccountA = "";
let bankAccountA = "";
let cashAccountB = "";

const contextA = () => ({ workspaceId: workspaceA, role: "OWNER" as const, userId: userA });
const contextB = () => ({ workspaceId: workspaceB, role: "OWNER" as const, userId: userB });

async function enableRestaurant(workspaceId: string) {
  await db.$executeRaw`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    ON CONFLICT ("workspaceId", "moduleKey") DO UPDATE SET "enabled"=true, "updatedAt"=now()
  `;
}

async function moveToReady(orderId: string) {
  await transitionRestaurantOrderWithIntegrity(contextA(), orderId, "PREPARING");
  await transitionRestaurantOrderWithIntegrity(contextA(), orderId, "READY");
}

async function cleanupWorkspace(workspaceId: string) {
  await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
  await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_order_item_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
  await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "recipe_items" WHERE "recipeId" IN (SELECT "id" FROM "recipes" WHERE "workspaceId"=${workspaceId}::uuid)`;
  await db.$executeRaw`DELETE FROM "recipes" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
  await db.cashBankAccount.deleteMany({ where: { workspaceId } });
  await db.account.deleteMany({ where: { workspaceId } });
  await db.product.deleteMany({ where: { workspaceId } });
  await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.auditLog.deleteMany({ where: { workspaceId } });
}

describe("restaurant workspace v1.1 accounting and stock integrity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRecipe } = await import("@/lib/server/industry-modules"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity, recordRestaurantPayment, voidRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));

    const [a, b] = await Promise.all([
      db.user.create({ data: { clerkId: `restaurant-integrity-a-${runId}`, email: `restaurant-integrity-a-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `restaurant-integrity-b-${runId}`, email: `restaurant-integrity-b-${runId}@example.invalid` } }),
    ]);
    userA = a.id;
    userB = b.id;
    const [wa, wb] = await Promise.all([
      db.workspace.create({ data: { name: `Restaurant Integrity A ${runId}`, vertical: "LEGACY", members: { create: { userId: userA, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `Restaurant Integrity B ${runId}`, vertical: "LEGACY", members: { create: { userId: userB, role: "OWNER" } } } }),
    ]);
    workspaceA = wa.id;
    workspaceB = wb.id;
    await Promise.all([enableRestaurant(workspaceA), enableRestaurant(workspaceB)]);

    const [cashA, bankA, cashB] = await Promise.all([
      createCashBankAccount(contextA(), { name: "Restaurant Cash", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" }),
      createCashBankAccount(contextA(), { name: "Restaurant Bank", openingBalance: 0, isBank: true, bankName: "Test Bank", accountTitle: "Restaurant", accountNumber: "001", notes: "" }),
      createCashBankAccount(contextB(), { name: "Other Restaurant Cash", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" }),
    ]);
    const [accountsA, accountsB] = await Promise.all([getCashBankAccounts(workspaceA), getCashBankAccounts(workspaceB)]);
    cashAccountA = accountsA.find((account) => account.id === cashA.id)!.cashBankAccountId;
    bankAccountA = accountsA.find((account) => account.id === bankA.id)!.cashBankAccountId;
    cashAccountB = accountsB.find((account) => account.id === cashB.id)!.cashBankAccountId;

    const [finished, ingredient, direct, lowStock] = await Promise.all([
      db.product.create({ data: { workspaceId: workspaceA, name: "Recipe Burger", sku: `RCP-${runId}`, stockQuantity: 0, costPrice: 0, sellingPrice: 500 } }),
      db.product.create({ data: { workspaceId: workspaceA, name: "Chicken", sku: `ING-${runId}`, stockQuantity: 10, costPrice: 100, sellingPrice: 0 } }),
      db.product.create({ data: { workspaceId: workspaceA, name: "Cold Drink", sku: `DIR-${runId}`, stockQuantity: 10, costPrice: 50, sellingPrice: 200 } }),
      db.product.create({ data: { workspaceId: workspaceA, name: "Limited Dessert", sku: `LOW-${runId}`, stockQuantity: 1, costPrice: 75, sellingPrice: 300 } }),
    ]);
    ingredientProductId = ingredient.id;
    directProductId = direct.id;
    lowStockProductId = lowStock.id;

    await createRecipe(contextA(), {
      finishedProductId: finished.id,
      yieldQuantity: 1,
      items: [{ ingredientProductId: ingredient.id, quantity: 0.25, wastagePercent: 0 }],
    });

    const category = await createRestaurantMenuCategory(contextA(), { name: "Launch Menu" });
    const [recipeItem, directItem, lowStockItem] = await Promise.all([
      createRestaurantMenuItem(contextA(), { categoryId: category.id, productId: finished.id, name: "Recipe Burger", price: 500 }),
      createRestaurantMenuItem(contextA(), { categoryId: category.id, productId: direct.id, name: "Cold Drink", price: 200 }),
      createRestaurantMenuItem(contextA(), { categoryId: category.id, productId: lowStock.id, name: "Limited Dessert", price: 300 }),
    ]);
    recipeMenuItemId = recipeItem.id;
    directMenuItemId = directItem.id;
    lowStockMenuItemId = lowStockItem.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await cleanupWorkspace(workspaceA);
    await cleanupWorkspace(workspaceB);
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await db.$disconnect();
  }, 60_000);

  it("posts recipe stock and balanced sale accounting exactly once on completion", async () => {
    const before = await db.product.findUniqueOrThrow({ where: { id: ingredientProductId } });
    const order = await createPosRestaurantOrder(contextA(), {
      fulfillmentType: "TAKEAWAY",
      taxAmount: 100,
      items: [{ menuItemId: recipeMenuItemId, quantity: 2 }],
    });
    await moveToReady(order.id);
    await transitionRestaurantOrderWithIntegrity(contextA(), order.id, "COMPLETED");

    const [after, state, movements, saleEntries] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: ingredientProductId } }),
      db.$queryRaw<Array<{ status: string; inventoryPostedAt: Date | null; accountingPostedAt: Date | null; inventoryCost: unknown }>>`
        SELECT "status", "inventoryPostedAt", "accountingPostedAt", "inventoryCost"
        FROM "restaurant_orders" WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceA}::uuid
      `,
      db.inventoryTransaction.findMany({ where: { workspaceId: workspaceA, reference: `RESTAURANT:${order.id}` } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId: workspaceA, sourceType: "SALE", sourceId: order.id } }),
    ]);
    expect(Number(before.stockQuantity) - Number(after.stockQuantity)).toBeCloseTo(0.5, 4);
    expect(state[0]?.status).toBe("COMPLETED");
    expect(state[0]?.inventoryPostedAt).toBeTruthy();
    expect(state[0]?.accountingPostedAt).toBeTruthy();
    expect(Number(state[0]?.inventoryCost)).toBe(50);
    expect(movements).toHaveLength(1);
    expect(Number(movements[0]!.quantityChanged)).toBeCloseTo(-0.5, 4);
    expect(saleEntries.reduce((sum, row) => sum + Number(row.debit), 0)).toBeCloseTo(saleEntries.reduce((sum, row) => sum + Number(row.credit), 0), 2);

    await transitionRestaurantOrderWithIntegrity(contextA(), order.id, "COMPLETED");
    expect(await db.inventoryTransaction.count({ where: { workspaceId: workspaceA, reference: `RESTAURANT:${order.id}` } })).toBe(movements.length);
    expect(await db.generalLedgerEntry.count({ where: { workspaceId: workspaceA, sourceType: "SALE", sourceId: order.id } })).toBe(saleEntries.length);
  });

  it("rolls back the entire completion when inventory is insufficient", async () => {
    const order = await createPosRestaurantOrder(contextA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId: lowStockMenuItemId, quantity: 2 }],
    });
    await moveToReady(order.id);
    const before = await db.product.findUniqueOrThrow({ where: { id: lowStockProductId } });
    await expect(transitionRestaurantOrderWithIntegrity(contextA(), order.id, "COMPLETED")).rejects.toThrow("Not enough ingredient stock");
    const [after, state, movements, saleEntries] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: lowStockProductId } }),
      db.$queryRaw<Array<{ status: string; inventoryPostedAt: Date | null; accountingPostedAt: Date | null }>>`
        SELECT "status", "inventoryPostedAt", "accountingPostedAt" FROM "restaurant_orders"
        WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceA}::uuid
      `,
      db.inventoryTransaction.count({ where: { workspaceId: workspaceA, reference: `RESTAURANT:${order.id}` } }),
      db.generalLedgerEntry.count({ where: { workspaceId: workspaceA, sourceType: "SALE", sourceId: order.id } }),
    ]);
    expect(Number(after.stockQuantity)).toBe(Number(before.stockQuantity));
    expect(state[0]).toMatchObject({ status: "READY", inventoryPostedAt: null, accountingPostedAt: null });
    expect(movements).toBe(0);
    expect(saleEntries).toBe(0);
  });

  it("supports idempotent split payments, rejects overpayment, and posts receipts on completion", async () => {
    const order = await createPosRestaurantOrder(contextA(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: directMenuItemId, quantity: 1 }] });
    const cashBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountA } });
    const bankBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankAccountA } });
    const first = await recordRestaurantPayment(contextA(), { orderId: order.id, cashBankAccountId: cashAccountA, method: "CASH", amount: 80, idempotencyKey: `restaurant:${runId}:split-a` });
    const retry = await recordRestaurantPayment(contextA(), { orderId: order.id, cashBankAccountId: cashAccountA, method: "CASH", amount: 80, idempotencyKey: `restaurant:${runId}:split-a` });
    expect(retry).toMatchObject({ id: first.id, idempotent: true });
    await recordRestaurantPayment(contextA(), { orderId: order.id, cashBankAccountId: bankAccountA, method: "CREDIT_CARD", amount: 120, idempotencyKey: `restaurant:${runId}:split-b` });
    await expect(recordRestaurantPayment(contextA(), { orderId: order.id, cashBankAccountId: cashAccountA, method: "CASH", amount: 1, idempotencyKey: `restaurant:${runId}:overpay` })).rejects.toThrow("exceeds the outstanding order balance");

    const pre = await db.$queryRaw<Array<{ paymentStatus: string; count: number }>>`
      SELECT ro."paymentStatus", COUNT(rp."id")::int AS "count"
      FROM "restaurant_orders" ro LEFT JOIN "restaurant_payments" rp ON rp."restaurantOrderId"=ro."id" AND rp."voidedAt" IS NULL
      WHERE ro."id"=${order.id}::uuid AND ro."workspaceId"=${workspaceA}::uuid GROUP BY ro."paymentStatus"
    `;
    expect(pre[0]).toMatchObject({ paymentStatus: "PAID", count: 2 });

    await moveToReady(order.id);
    await transitionRestaurantOrderWithIntegrity(contextA(), order.id, "COMPLETED");
    const [cashAfter, bankAfter, paymentRows] = await Promise.all([
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountA } }),
      db.cashBankAccount.findUniqueOrThrow({ where: { id: bankAccountA } }),
      db.$queryRaw<Array<{ postedAt: Date | null }>>`SELECT "postedAt" FROM "restaurant_payments" WHERE "workspaceId"=${workspaceA}::uuid AND "restaurantOrderId"=${order.id}::uuid AND "voidedAt" IS NULL`,
    ]);
    expect(Number(cashAfter.currentBalance) - Number(cashBefore.currentBalance)).toBe(80);
    expect(Number(bankAfter.currentBalance) - Number(bankBefore.currentBalance)).toBe(120);
    expect(paymentRows).toHaveLength(2);
    expect(paymentRows.every((row) => Boolean(row.postedAt))).toBe(true);
    expect(await db.generalLedgerEntry.count({ where: { workspaceId: workspaceA, sourceType: "RECEIPT", sourceId: first.id } })).toBe(2);
  });

  it("reverses posted payments and blocks cancellation until active payments are voided", async () => {
    const completed = await createPosRestaurantOrder(contextA(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: directMenuItemId, quantity: 1 }] });
    const postedPayment = await recordRestaurantPayment(contextA(), { orderId: completed.id, cashBankAccountId: cashAccountA, method: "CASH", amount: 200, idempotencyKey: `restaurant:${runId}:void-posted` });
    await moveToReady(completed.id);
    await transitionRestaurantOrderWithIntegrity(contextA(), completed.id, "COMPLETED");
    const beforeVoid = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountA } });
    await voidRestaurantPayment(contextA(), postedPayment.id, "Customer changed settlement method");
    const [afterVoid, paymentRows, completedRows, reversals] = await Promise.all([
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountA } }),
      db.$queryRaw<Array<{ postedAt: Date | null; voidedAt: Date | null }>>`SELECT "postedAt", "voidedAt" FROM "restaurant_payments" WHERE "id"=${postedPayment.id}::uuid`,
      db.$queryRaw<Array<{ paymentStatus: string }>>`SELECT "paymentStatus" FROM "restaurant_orders" WHERE "id"=${completed.id}::uuid`,
      db.generalLedgerEntry.findMany({ where: { workspaceId: workspaceA, reversalOfId: { not: null }, reversalReason: { contains: "restaurant payment" } } }),
    ]);
    expect(Number(beforeVoid.currentBalance) - Number(afterVoid.currentBalance)).toBe(200);
    expect(paymentRows[0]?.postedAt).toBeTruthy();
    expect(paymentRows[0]?.voidedAt).toBeTruthy();
    expect(completedRows[0]?.paymentStatus).toBe("UNPAID");
    expect(reversals.length).toBeGreaterThanOrEqual(2);

    const cancellable = await createPosRestaurantOrder(contextA(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: directMenuItemId, quantity: 1 }] });
    const pendingPayment = await recordRestaurantPayment(contextA(), { orderId: cancellable.id, cashBankAccountId: cashAccountA, method: "CASH", amount: 50, idempotencyKey: `restaurant:${runId}:cancel-guard` });
    await expect(transitionRestaurantOrderWithIntegrity(contextA(), cancellable.id, "CANCELLED")).rejects.toThrow("Void or refund restaurant payments");
    await voidRestaurantPayment(contextA(), pendingPayment.id, "Cancel order before preparation");
    await transitionRestaurantOrderWithIntegrity(contextA(), cancellable.id, "CANCELLED");
    const cancelledRows = await db.$queryRaw<Array<{ status: string; paymentStatus: string }>>`SELECT "status", "paymentStatus" FROM "restaurant_orders" WHERE "id"=${cancellable.id}::uuid`;
    expect(cancelledRows[0]).toMatchObject({ status: "CANCELLED", paymentStatus: "UNPAID" });
  });

  it("rejects cross-workspace cash accounts in both the service and database guard", async () => {
    const order = await createPosRestaurantOrder(contextA(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: directMenuItemId, quantity: 1 }] });
    await expect(recordRestaurantPayment(contextA(), { orderId: order.id, cashBankAccountId: cashAccountB, method: "CASH", amount: 10, idempotencyKey: `restaurant:${runId}:cross-domain` })).rejects.toThrow("unavailable in this workspace");
    await expect(db.$executeRaw`
      INSERT INTO "restaurant_payments" ("workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "idempotencyKey")
      VALUES (${workspaceA}::uuid, ${order.id}::uuid, ${cashAccountB}, 'CASH', 10, ${`restaurant:${runId}:cross-db`})
    `).rejects.toThrow("Cross-workspace restaurant payment cash account reference rejected");
  });
});