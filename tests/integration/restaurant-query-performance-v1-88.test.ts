import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let listRestaurantPayments: typeof import("@/lib/server/restaurant-integrity")["listRestaurantPayments"];
let listRestaurantNetPaymentSummaries: typeof import("@/lib/server/restaurant-payment-summary")["listRestaurantNetPaymentSummaries"];

const runId = randomUUID();
let workspaceId = "";
let userId = "";
let bankAccountId = "";
let menuItemId = "";
const orderIds: string[] = [];

const owner = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("Restaurant V1.88 bounded operational projections", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ listRestaurantPayments } = await import("@/lib/server/restaurant-integrity"));
    ({ listRestaurantNetPaymentSummaries } = await import("@/lib/server/restaurant-payment-summary"));

    const user = await db.user.create({
      data: { clerkId: `v188-${runId}`, email: `v188-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `V1.88 query scope ${runId}`,
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
      name: "V1.88 bank",
      openingBalance: 0,
      isBank: true,
      bankName: "Test Bank",
      accountTitle: "Restaurant",
      accountNumber: `V188-${runId.slice(0, 8)}`,
      notes: "",
    });
    const accounts = await getCashBankAccounts(workspaceId);
    bankAccountId = accounts.find((account) => account.id === bank.id)!.cashBankAccountId;

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.88 item",
        sku: `V188-${runId}`,
        stockQuantity: 100,
        costPrice: 20,
        sellingPrice: 100,
      },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: `V1.88 ${runId}` });
    const item = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.88 item",
      price: 100,
    });
    menuItemId = item.id;

    for (let index = 0; index < 3; index += 1) {
      const order = await createPosRestaurantOrder(owner(), {
        fulfillmentType: "TAKEAWAY",
        items: [{ menuItemId, quantity: 1 }],
      });
      orderIds.push(order.id);
    }

    await recordRestaurantPaymentAtCollection(owner(), {
      orderId: orderIds[0]!,
      cashBankAccountId: bankAccountId,
      method: "BANK_TRANSFER",
      amount: 40,
      idempotencyKey: `v188:pay:${randomUUID()}`,
    });
    await recordRestaurantPaymentAtCollection(owner(), {
      orderId: orderIds[1]!,
      cashBankAccountId: bankAccountId,
      method: "BANK_TRANSFER",
      amount: 100,
      idempotencyKey: `v188:pay:${randomUUID()}`,
    });
  }, 60_000);

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("returns payments only for the requested visible order scope", async () => {
    const firstOnly = await listRestaurantPayments(workspaceId, [orderIds[0]!]);
    expect(firstOnly).toHaveLength(1);
    expect(firstOnly[0]?.restaurantOrderId).toBe(orderIds[0]);

    const firstTwo = await listRestaurantPayments(workspaceId, [orderIds[0]!, orderIds[1]!]);
    expect(new Set(firstTwo.map((payment) => payment.restaurantOrderId))).toEqual(new Set([orderIds[0], orderIds[1]]));

    expect(await listRestaurantPayments(workspaceId, [])).toEqual([]);
  });

  it("returns net payment summaries only for the requested visible order scope", async () => {
    const first = await listRestaurantNetPaymentSummaries(workspaceId, [orderIds[0]!]);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      restaurantOrderId: orderIds[0],
      adjustedDue: 100,
      retainedPaid: 40,
      outstanding: 60,
    });

    const firstTwo = await listRestaurantNetPaymentSummaries(workspaceId, [orderIds[0]!, orderIds[1]!]);
    expect(firstTwo).toHaveLength(2);
    const byId = new Map(firstTwo.map((summary) => [summary.restaurantOrderId, summary]));
    expect(byId.get(orderIds[1]!)).toMatchObject({ adjustedDue: 100, retainedPaid: 100, outstanding: 0 });

    expect(await listRestaurantNetPaymentSummaries(workspaceId, [])).toEqual([]);
  });

  it("rejects invalid scoped order IDs before SQL execution", async () => {
    await expect(listRestaurantPayments(workspaceId, ["not-a-uuid"])).rejects.toThrow(/Restaurant order is invalid/i);
    await expect(listRestaurantNetPaymentSummaries(workspaceId, ["not-a-uuid"])).rejects.toThrow(/Restaurant order is invalid/i);
  });

  it("installs the operational recency indexes used by the order board", async () => {
    const rows = await db.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname='public'
        AND indexname IN (
          'restaurant_orders_workspace_created_idx',
          'restaurant_payments_workspace_created_idx'
        )
      ORDER BY indexname
    `;
    expect(rows.map((row) => row.indexname)).toEqual([
      "restaurant_orders_workspace_created_idx",
      "restaurant_payments_workspace_created_idx",
    ]);
  });
  it("covers all three queues without silently truncating the 430-order visible scope", async () => {
    const scope = [...Array.from({ length: 427 }, () => randomUUID()), ...orderIds];
    expect(await listRestaurantNetPaymentSummaries(workspaceId, scope)).toHaveLength(3);
    expect(await listRestaurantPayments(workspaceId, scope)).toHaveLength(2);
    const oversized = [...Array.from({ length: 501 }, () => randomUUID())];
    await expect(listRestaurantNetPaymentSummaries(workspaceId, oversized)).rejects.toThrow(/at most 500/);
    await expect(listRestaurantPayments(workspaceId, oversized)).rejects.toThrow(/at most 500/);
    await expect(listRestaurantNetPaymentSummaries(workspaceId, [...scope, "invalid-tail"])).rejects.toThrow(/Restaurant order is invalid/);
    await expect(listRestaurantPayments(workspaceId, [...scope, "invalid-tail"])).rejects.toThrow(/Restaurant order is invalid/);
  });
});
