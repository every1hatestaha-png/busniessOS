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
let ledgerAccountId = "";
let cashBankAccountId = "";
let unreferencedAccountId = "";
const owner = () => ({ workspaceId, role: "OWNER" as const, userId });

describe("restaurant V1.62 settlement ledger parent identity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));

    const user = await db.user.create({ data: { clerkId: `v162-${runId}`, email: `v162-${runId}@example.invalid` } });
    userId = user.id;
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: `V162 ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `V162 other ${runId}`, vertical: "LEGACY" } }),
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const ledger = await createCashBankAccount(owner(), {
      name: "V162 Drawer",
      openingBalance: 0,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    ledgerAccountId = ledger.id;
    const cashAccounts = await getCashBankAccounts(workspaceId);
    cashBankAccountId = cashAccounts.find(account => account.id === ledger.id)!.cashBankAccountId;
    const { openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts");
    await openRestaurantCashShiftSafely(owner(), 0, "V1.84 ledger parent shift");

    const unreferenced = await db.account.create({
      data: {
        workspaceId,
        code: `V162-${runId.slice(0, 8)}`,
        name: "V162 unreferenced",
        category: "ASSET",
        normalBalance: "DEBIT",
        isActive: true,
      },
    });
    unreferencedAccountId = unreferenced.id;

    const product = await db.product.create({ data: { workspaceId, name: `V162 Meal ${runId}`, stockQuantity: 10, costPrice: 20, sellingPrice: 100 } });
    const category = await createRestaurantMenuCategory(owner(), { name: `V162 Menu ${runId}` });
    const menu = await createRestaurantMenuItem(owner(), { categoryId: category.id, productId: product.id, name: "V162 Meal", price: 100 });
    const order = await createPosRestaurantOrder(owner(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: menu.id, quantity: 1 }] });
    await recordRestaurantPaymentAtCollection(owner(), {
      orderId: order.id,
      cashBankAccountId,
      method: "CASH",
      amount: 100,
      idempotencyKey: `v162:${runId}`,
    });
  }, 60_000);

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("rejects tenant, identity, chart-code and accounting-semantic rewrites", async () => {
    const error = "Restaurant-linked settlement ledger identity and accounting semantics are immutable";

    await expect(db.account.update({ where: { id: ledgerAccountId }, data: { workspaceId: otherWorkspaceId } }))
      .rejects.toThrow(error);
    await expect(db.account.update({ where: { id: ledgerAccountId }, data: { id: randomUUID() } }))
      .rejects.toThrow(error);
    await expect(db.account.update({ where: { id: ledgerAccountId }, data: { code: `CHANGED-${runId.slice(0, 6)}` } }))
      .rejects.toThrow(error);
    await expect(db.account.update({ where: { id: ledgerAccountId }, data: { category: "EXPENSE" } }))
      .rejects.toThrow(error);
    await expect(db.account.update({ where: { id: ledgerAccountId }, data: { normalBalance: "CREDIT" } }))
      .rejects.toThrow(error);
    await expect(db.account.delete({ where: { id: ledgerAccountId } }))
      .rejects.toThrow("Restaurant-linked settlement ledger account cannot be deleted");

    const preserved = await db.account.findUniqueOrThrow({ where: { id: ledgerAccountId } });
    expect(preserved.workspaceId).toBe(workspaceId);
    expect(preserved.category).toBe("ASSET");
    expect(preserved.normalBalance).toBe("DEBIT");
  });

  it("allows descriptive edits and deactivation without changing accounting identity", async () => {
    const before = await db.account.findUniqueOrThrow({ where: { id: ledgerAccountId } });
    const updated = await db.account.update({
      where: { id: ledgerAccountId },
      data: { name: "V162 Archived Drawer Ledger", isActive: false },
    });
    expect(updated.name).toBe("V162 Archived Drawer Ledger");
    expect(updated.isActive).toBe(false);
    expect(updated.code).toBe(before.code);
    expect(updated.category).toBe(before.category);
    expect(updated.normalBalance).toBe(before.normalBalance);
  });

  it("does not freeze unrelated ledger accounts", async () => {
    const updated = await db.account.update({
      where: { id: unreferencedAccountId },
      data: { category: "EXPENSE", normalBalance: "DEBIT", code: `FREE-${runId.slice(0, 8)}` },
    });
    expect(updated.category).toBe("EXPENSE");
    await db.account.delete({ where: { id: unreferencedAccountId } });
    expect(await db.account.findUnique({ where: { id: unreferencedAccountId } })).toBeNull();
  });
});
