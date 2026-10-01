import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let openRestaurantCashShiftSafely: typeof import("@/lib/server/restaurant-cash-shifts")["openRestaurantCashShiftSafely"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let menuItemId = "";
let cashAccountId = "";
let bankAccountId = "";
const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

describe("restaurant V1.12 payment settlement account integrity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts"));

    const user = await db.user.create({ data: { clerkId: `settlement-${runId}`, email: `settlement-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: { name: `Settlement Integrity ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(owner(), {
      name: "Restaurant Drawer",
      openingBalance: 0,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    const bank = await createCashBankAccount(owner(), {
      name: "Restaurant Bank",
      openingBalance: 0,
      isBank: true,
      bankName: "Test Bank",
      accountTitle: "Restaurant",
      accountNumber: `BANK-${runId}`,
      notes: "",
    });
    const accounts = await getCashBankAccounts(workspaceId);
    cashAccountId = accounts.find((account) => account.id === cash.id)!.cashBankAccountId;
    bankAccountId = accounts.find((account) => account.id === bank.id)!.cashBankAccountId;

    const product = await db.product.create({
      data: { workspaceId, name: "Settlement Meal", sku: `SET-${runId}`, stockQuantity: 20, costPrice: 80, sellingPrice: 400 },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: "Settlement Menu" });
    const item = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "Settlement Meal",
      price: 400,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("rejects CASH into a bank account and non-cash into the physical drawer", async () => {
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });

    await expect(recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId: bankAccountId,
      method: "CASH",
      amount: 100,
      idempotencyKey: `settlement:${runId}:bad-cash`,
    })).rejects.toThrow("Cash restaurant payments must use a physical cash account");

    await expect(recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId: cashAccountId,
      method: "BANK_TRANSFER",
      amount: 100,
      idempotencyKey: `settlement:${runId}:bad-bank`,
    })).rejects.toThrow("Non-cash restaurant payments must use a bank or digital settlement account");

    expect(await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_payments" WHERE "restaurantOrderId"=${order.id}::uuid
    `).toEqual([{ count: 0 }]);
  });

  it("allows correctly matched cash and bank settlement accounts", async () => {
    await openRestaurantCashShiftSafely(owner(), 0, "Payment account integrity test shift");
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });

    const cashPayment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId: cashAccountId,
      method: "CASH",
      amount: 150,
      idempotencyKey: `settlement:${runId}:cash-ok`,
    });
    const bankPayment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId: bankAccountId,
      method: "BANK_TRANSFER",
      amount: 250,
      idempotencyKey: `settlement:${runId}:bank-ok`,
    });

    const rows = await db.$queryRaw<Array<{ id: string; method: string; postedAt: Date | null }>>`
      SELECT "id"::text AS "id", "method"::text AS "method", "postedAt"
      FROM "restaurant_payments"
      WHERE "id" IN (${cashPayment.id}::uuid, ${bankPayment.id}::uuid)
      ORDER BY "method"
    `;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => Boolean(row.postedAt))).toBe(true);
  });

  it("blocks a direct SQL caller from bypassing method-to-account semantics", async () => {
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_payments" (
        "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "createdById"
      ) VALUES (
        ${workspaceId}::uuid, ${order.id}::uuid, ${bankAccountId}, 'CASH', 1, ${userId}
      )
    `).rejects.toThrow("Cash restaurant payments must use a physical cash account");
  });
});