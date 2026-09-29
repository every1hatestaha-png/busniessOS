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
let ownerId = "";
let staffId = "";
let foreignId = "";
let workspaceId = "";
let foreignWorkspaceId = "";
let menuItemId = "";
let cashAccountId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId: ownerId });
const staff = () => ({ workspaceId, role: "STAFF" as const, userId: staffId });
const forgedStaff = () => ({ workspaceId, role: "STAFF" as const, userId: foreignId });

describe("restaurant V1.17 payment actor membership", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));

    const [ownerUser, staffUser, foreignUser] = await Promise.all([
      db.user.create({ data: { clerkId: `pay-owner-${runId}`, email: `pay-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `pay-staff-${runId}`, email: `pay-staff-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `pay-foreign-${runId}`, email: `pay-foreign-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    staffId = staffUser.id;
    foreignId = foreignUser.id;

    const [workspace, foreignWorkspace] = await Promise.all([
      db.workspace.create({
        data: {
          name: `Payment Actor A ${runId}`,
          vertical: "LEGACY",
          members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: staffId, role: "STAFF" }] },
        },
      }),
      db.workspace.create({
        data: {
          name: `Payment Actor B ${runId}`,
          vertical: "LEGACY",
          members: { create: { userId: foreignId, role: "STAFF" } },
        },
      }),
    ]);
    workspaceId = workspace.id;
    foreignWorkspaceId = foreignWorkspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(owner(), {
      name: "Payment Actor Drawer",
      openingBalance: 0,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    const accounts = await getCashBankAccounts(workspaceId);
    cashAccountId = accounts.find((account) => account.id === cash.id)!.cashBankAccountId;

    const product = await db.product.create({
      data: { workspaceId, name: "Payment Actor Meal", sku: `PAY-${runId}`, stockQuantity: 20, costPrice: 100, sellingPrice: 500 },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: "Payment Actor Menu" });
    const item = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "Payment Actor Meal",
      price: 500,
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
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, staffId, foreignId] } } });
    await db.$disconnect();
  }, 60_000);

  it("allows a real staff member to collect and immediately post a restaurant payment", async () => {
    const order = await createPosRestaurantOrder(staff(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const payment = await recordRestaurantPaymentAtCollection(staff(), {
      orderId: order.id,
      cashBankAccountId: cashAccountId,
      method: "CASH",
      amount: 200,
      idempotencyKey: `payactor:${runId}:valid`,
    });

    const rows = await db.$queryRaw<Array<{ createdById: string | null; postedAt: Date | null }>>`
      SELECT "createdById", "postedAt" FROM "restaurant_payments" WHERE "id"=${payment.id}::uuid
    `;
    expect(rows[0]?.createdById).toBe(staffId);
    expect(rows[0]?.postedAt).not.toBeNull();
  });

  it("rejects a forged payment actor from another workspace and rolls back posting", async () => {
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const ledgerBefore = await db.generalLedgerEntry.count({ where: { workspaceId } });

    await expect(recordRestaurantPaymentAtCollection(forgedStaff(), {
      orderId: order.id,
      cashBankAccountId: cashAccountId,
      method: "CASH",
      amount: 200,
      idempotencyKey: `payactor:${runId}:forged`,
    })).rejects.toThrow("Restaurant payment creator must be a member of the same workspace");

    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_payments" WHERE "restaurantOrderId"=${order.id}::uuid
    `;
    expect(rows[0]?.count).toBe(0);
    expect(await db.generalLedgerEntry.count({ where: { workspaceId } })).toBe(ledgerBefore);
  });

  it("blocks a direct SQL caller from attaching a foreign actor ID", async () => {
    const order = await createPosRestaurantOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_payments" (
        "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "createdById"
      ) VALUES (
        ${workspaceId}::uuid, ${order.id}::uuid, ${cashAccountId}, 'CASH', 1, ${foreignId}
      )
    `).rejects.toThrow("Restaurant payment creator must be a member of the same workspace");
  });
});