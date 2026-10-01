import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let voidRestaurantPayment: typeof import("@/lib/server/restaurant-integrity")["voidRestaurantPayment"];
let openRestaurantCashShiftSafely: typeof import("@/lib/server/restaurant-cash-shifts")["openRestaurantCashShiftSafely"];
let closeRestaurantCashShiftFromLedger: typeof import("@/lib/server/restaurant-cash-shifts")["closeRestaurantCashShiftFromLedger"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let bankAccountId = "";
let menuItemId = "";

const owner = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("Restaurant V1.85 timezone invariance", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ voidRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ openRestaurantCashShiftSafely, closeRestaurantCashShiftFromLedger } = await import("@/lib/server/restaurant-cash-shifts"));

    const user = await db.user.create({
      data: { clerkId: `v185-timezone-${runId}`, email: `v185-timezone-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `V1.85 timezone ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;

    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const bank = await createCashBankAccount(owner(), {
      name: "V1.85 timezone bank",
      openingBalance: 0,
      isBank: true,
      bankName: "Test Bank",
      accountTitle: "Restaurant",
      accountNumber: `V185-${runId.slice(0, 8)}`,
      notes: "",
    });
    const accounts = await getCashBankAccounts(workspaceId);
    bankAccountId = accounts.find((account) => account.id === bank.id)!.cashBankAccountId;

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.85 timezone meal",
        sku: `V185-TZ-${runId}`,
        stockQuantity: 20,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: `V1.85 timezone ${runId}` });
    const menu = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.85 timezone meal",
      price: 200,
    });
    menuItemId = menu.id;
  }, 60_000);

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("keeps receipt posting and void evidence monotonic in the database timezone", async () => {
    const timezone = await db.$queryRaw<Array<{ timezone: string }>>`
      SELECT current_setting('TimeZone') AS "timezone"
    `;
    expect(timezone[0]?.timezone).toBeTruthy();

    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const payment = await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId: bankAccountId,
      method: "BANK_TRANSFER",
      amount: 200,
      idempotencyKey: `v185:timezone:${randomUUID()}`,
    });

    const beforeVoid = await db.$queryRaw<Array<{ createdAt: Date; postedAt: Date | null }>>`
      SELECT "createdAt", "postedAt"
      FROM "restaurant_payments"
      WHERE "id"=${payment.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    expect(beforeVoid[0]?.postedAt).not.toBeNull();
    expect(beforeVoid[0]!.postedAt!.getTime()).toBeGreaterThanOrEqual(beforeVoid[0]!.createdAt.getTime());

    await voidRestaurantPayment(owner(), payment.id, "Timezone-safe void");

    const afterVoid = await db.$queryRaw<Array<{ createdAt: Date; postedAt: Date | null; voidedAt: Date | null }>>`
      SELECT "createdAt", "postedAt", "voidedAt"
      FROM "restaurant_payments"
      WHERE "id"=${payment.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    expect(afterVoid[0]?.voidedAt).not.toBeNull();
    expect(afterVoid[0]!.voidedAt!.getTime()).toBeGreaterThanOrEqual(afterVoid[0]!.createdAt.getTime());
  }, 60_000);

  it("closes cash shifts with database-clock evidence regardless of session timezone", async () => {
    const shift = await openRestaurantCashShiftSafely(owner(), 125, "Timezone-safe shift");
    const closed = await closeRestaurantCashShiftFromLedger(owner(), shift.id, 125, "Timezone-safe close");

    expect(closed.expectedCash).toBe(125);
    expect(closed.variance).toBe(0);
    expect(closed.closedAt.getTime()).toBeGreaterThanOrEqual(shift.openedAt.getTime());

    const rows = await db.$queryRaw<Array<{ openedAt: Date; closedAt: Date | null }>>`
      SELECT "openedAt", "closedAt"
      FROM "cash_shifts"
      WHERE "id"=${shift.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    expect(rows[0]?.closedAt).not.toBeNull();
    expect(rows[0]!.closedAt!.getTime()).toBeGreaterThanOrEqual(rows[0]!.openedAt.getTime());
  }, 60_000);
});
