import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let cashBankAccountId = "";
let ledgerAccountId = "";
let alternateLedgerAccountId = "";
let unreferencedCashBankAccountId = "";
const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

describe("restaurant V1.60 settlement-account parent identity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));

    const user = await db.user.create({ data: { clerkId: `v160-${runId}`, email: `v160-${runId}@example.invalid` } });
    userId = user.id;
    const [workspace, otherWorkspace] = await Promise.all([
      db.workspace.create({
        data: { name: `V160 ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
      }),
      db.workspace.create({ data: { name: `V160 other ${runId}`, vertical: "LEGACY" } }),
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = otherWorkspace.id;

    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(owner(), {
      name: "V160 Drawer",
      openingBalance: 0,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    ledgerAccountId = cash.id;

    const spare = await createCashBankAccount(owner(), {
      name: "V160 Spare",
      openingBalance: 0,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });

    const accounts = await getCashBankAccounts(workspaceId);
    cashBankAccountId = accounts.find(account => account.id === cash.id)!.cashBankAccountId;
    unreferencedCashBankAccountId = accounts.find(account => account.id === spare.id)!.cashBankAccountId;
    const { openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts");
    await openRestaurantCashShiftSafely(owner(), 0, "V1.84 settlement parent shift");

    const alternateLedger = await db.account.create({
      data: {
        workspaceId,
        code: `V160-${runId.slice(0, 8)}`,
        name: "V160 alternate ledger",
        category: "ASSET",
        normalBalance: "DEBIT",
        isActive: true,
      },
    });
    alternateLedgerAccountId = alternateLedger.id;

    const product = await db.product.create({
      data: { workspaceId, name: `V160 Meal ${runId}`, stockQuantity: 10, costPrice: 40, sellingPrice: 100 },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: `V160 Menu ${runId}` });
    const menuItem = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "V160 Meal",
      price: 100,
    });
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId: menuItem.id, quantity: 1 }],
    });
    await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId,
      method: "CASH",
      amount: 100,
      idempotencyKey: `v160:${runId}`,
    });
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
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
    await db.workspace.delete({ where: { id: otherWorkspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("rejects every parent mutation that can reinterpret recorded Restaurant settlement history", async () => {
    const error = "Restaurant-linked settlement account identity, workspace, ledger account and type are immutable";

    await expect(db.cashBankAccount.update({
      where: { id: cashBankAccountId },
      data: { workspaceId: otherWorkspaceId },
    })).rejects.toThrow(error);

    await expect(db.cashBankAccount.update({
      where: { id: cashBankAccountId },
      data: { id: randomUUID() },
    })).rejects.toThrow(error);

    await expect(db.cashBankAccount.update({
      where: { id: cashBankAccountId },
      data: { accountId: alternateLedgerAccountId },
    })).rejects.toThrow(error);

    await expect(db.cashBankAccount.update({
      where: { id: cashBankAccountId },
      data: { isBank: true },
    })).rejects.toThrow(error);

    await expect(db.cashBankAccount.delete({ where: { id: cashBankAccountId } }))
      .rejects.toThrow("Restaurant-linked settlement account cannot be deleted");

    const preserved = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountId } });
    expect(preserved.workspaceId).toBe(workspaceId);
    expect(preserved.accountId).toBe(ledgerAccountId);
    expect(preserved.isBank).toBe(false);
  });

  it("still permits non-identity descriptive edits and deactivation", async () => {
    const updated = await db.cashBankAccount.update({
      where: { id: cashBankAccountId },
      data: { name: "V160 Archived Drawer", notes: "Closed after shift", isActive: false },
    });
    expect(updated.name).toBe("V160 Archived Drawer");
    expect(updated.notes).toBe("Closed after shift");
    expect(updated.isActive).toBe(false);
    expect(updated.accountId).toBe(ledgerAccountId);
  });

  it("does not freeze unreferenced settlement accounts", async () => {
    const updated = await db.cashBankAccount.update({
      where: { id: unreferencedCashBankAccountId },
      data: { isBank: true },
    });
    expect(updated.isBank).toBe(true);
    await db.cashBankAccount.delete({ where: { id: unreferencedCashBankAccountId } });
    expect(await db.cashBankAccount.findUnique({ where: { id: unreferencedCashBankAccountId } })).toBeNull();
  });
});
