import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transitionRestaurantOrderWithIntegrity: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let voidRestaurantPayment: typeof import("@/lib/server/restaurant-integrity")["voidRestaurantPayment"];
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let refundRestaurantPayment: typeof import("@/lib/server/restaurant-refunds")["refundRestaurantPayment"];
let createRestaurantItemReturn: typeof import("@/lib/server/restaurant-item-returns")["createRestaurantItemReturn"];
let reverseRestaurantItemReturn: typeof import("@/lib/server/restaurant-return-reversals")["reverseRestaurantItemReturn"];

const runId = randomUUID();
let ownerId = "";
let staffId = "";
let workspaceId = "";
let menuItemId = "";
let cashAccountId = "";

const owner = () => ({ workspaceId, role: "OWNER" as const, userId: ownerId });
const forgedManager = () => ({ workspaceId, role: "MANAGER" as const, userId: staffId });

async function createOrder() {
  return createPosRestaurantOrder(owner(), {
    fulfillmentType: "TAKEAWAY",
    items: [{ menuItemId, quantity: 1 }],
  });
}

async function complete(orderId: string) {
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "PREPARING");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "READY");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "COMPLETED");
}

async function pay(orderId: string, key: string) {
  return recordRestaurantPaymentAtCollection(owner(), {
    orderId,
    cashBankAccountId,
    method: "CASH",
    amount: 200,
    idempotencyKey: key,
  });
}

describe("restaurant V1.13 manager actor integrity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity, voidRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds"));
    ({ createRestaurantItemReturn } = await import("@/lib/server/restaurant-item-returns"));
    ({ reverseRestaurantItemReturn } = await import("@/lib/server/restaurant-return-reversals"));

    const [ownerUser, staffUser] = await Promise.all([
      db.user.create({ data: { clerkId: `actor-owner-${runId}`, email: `actor-owner-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `actor-staff-${runId}`, email: `actor-staff-${runId}@example.invalid` } }),
    ]);
    ownerId = ownerUser.id;
    staffId = staffUser.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Restaurant Actor ${runId}`,
        vertical: "LEGACY",
        members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: staffId, role: "STAFF" }] },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(owner(), {
      name: "Actor Drawer",
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
      data: { workspaceId, name: "Actor Meal", sku: `ACT-${runId}`, stockQuantity: 20, costPrice: 50, sellingPrice: 200 },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: "Actor Menu" });
    const item = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "Actor Meal",
      price: 200,
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
    await db.$executeRaw`DELETE FROM "restaurant_inventory_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, staffId] } } });
    await db.$disconnect();
  }, 60_000);

  it("rejects a forged manager actor when voiding a restaurant payment", async () => {
    const order = await createOrder();
    const payment = await pay(order.id, `actor:${runId}:void-payment`);

    await expect(voidRestaurantPayment(forgedManager(), payment.id, "Forged manager void"))
      .rejects.toThrow("Restaurant payment void requires a manager actor from the same workspace");

    const rows = await db.$queryRaw<Array<{ voidedAt: Date | null; voidedById: string | null }>>`
      SELECT "voidedAt", "voidedById" FROM "restaurant_payments" WHERE "id"=${payment.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ voidedAt: null, voidedById: null });
  });

  it("rejects a forged manager actor when creating a completed-order refund", async () => {
    const order = await createOrder();
    const payment = await pay(order.id, `actor:${runId}:refund-payment`);
    await complete(order.id);

    await expect(refundRestaurantPayment(forgedManager(), {
      paymentId: payment.id,
      reason: "Forged manager refund",
      idempotencyKey: `actor:${runId}:refund-request`,
    })).rejects.toThrow("Restaurant refund requires a manager actor from the same workspace");

    const refunds = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_refunds" WHERE "restaurantPaymentId"=${payment.id}::uuid
    `;
    expect(refunds[0]?.count).toBe(0);
  });

  it("rejects forged manager actors for item returns and compensating reversals", async () => {
    const order = await createOrder();
    const payment = await pay(order.id, `actor:${runId}:return-payment`);
    await complete(order.id);
    const itemRows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items" WHERE "restaurantOrderId"=${order.id}::uuid LIMIT 1
    `;
    const orderItemId = itemRows[0]!.id;

    await expect(createRestaurantItemReturn(forgedManager(), {
      orderId: order.id,
      reason: "Forged manager return",
      idempotencyKey: `actor:${runId}:bad-return`,
      items: [{ orderItemId, quantity: 1, restock: false }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    })).rejects.toThrow("Restaurant return requires a manager actor from the same workspace");

    const created = await createRestaurantItemReturn(owner(), {
      orderId: order.id,
      reason: "Valid owner return",
      idempotencyKey: `actor:${runId}:good-return`,
      items: [{ orderItemId, quantity: 1, restock: false }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });

    await expect(reverseRestaurantItemReturn(forgedManager(), created.id, "Forged manager reversal"))
      .rejects.toThrow("Restaurant return requires a manager actor from the same workspace");

    const reversalRows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_returns"
      WHERE "workspaceId"=${workspaceId}::uuid AND "reversalOfId"=${created.id}::uuid
    `;
    expect(reversalRows[0]?.count).toBe(0);
  });
});