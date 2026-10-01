import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantTable: typeof import("@/lib/server/industry-modules")["createRestaurantTable"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transitionRestaurantOrderWithIntegrity: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let recordRestaurantPaymentAtCollection: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];

const runId = randomUUID();
let workspaceId = "";
let ownerId = "";
let menuItemId = "";
let cashAccountId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });

async function order(input?: { dineIn?: boolean; tableId?: string }) {
  return createPosRestaurantOrder(owner(), {
    fulfillmentType: input?.dineIn ? "DINE_IN" : "TAKEAWAY",
    restaurantTableId: input?.tableId,
    items: [{ menuItemId, quantity: 1 }],
  });
}

async function complete(orderId: string) {
  for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
    await transitionRestaurantOrderWithIntegrity(owner(), orderId, status);
  }
}

async function state(orderId: string) {
  const [orders, payments, ledger, tickets] = await Promise.all([
    db.$queryRaw<Array<{ status: string; paymentStatus: string; total: string }>>`
      SELECT "status", "paymentStatus", "total"::text AS "total"
      FROM "restaurant_orders" WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.$queryRaw<Array<{ id: string; amount: string; postedAt: Date | null; voidedAt: Date | null }>>`
      SELECT "id"::text AS "id", "amount"::text AS "amount", "postedAt", "voidedAt"
      FROM "restaurant_payments" WHERE "restaurantOrderId"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<{ sourceType: string; sourceId: string }>>`
      SELECT "sourceType", "sourceId" FROM "general_ledger_entries"
      WHERE "workspaceId"=${workspaceId} AND "sourceId" IN (
        SELECT "id"::text FROM "restaurant_payments" WHERE "restaurantOrderId"=${orderId}::uuid
        UNION ALL SELECT ${orderId}
      ) ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "kitchen_tickets"
      WHERE "restaurantOrderId"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
  ]);
  return { order: orders[0]!, payments, ledger, tickets };
}

describe("Restaurant V1.80 confirmed-finding regressions", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantTable } = await import("@/lib/server/industry-modules"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity } = await import("@/lib/server/restaurant-integrity"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));

    const ownerUser = await db.user.create({
      data: { clerkId: `v180-owner-${runId}`, email: `v180-owner-${runId}@example.invalid` },
    });
    ownerId = ownerUser.id;
    const workspace = await db.workspace.create({
      data: {
        name: `V1.80 adversarial ${runId}`,
        vertical: "LEGACY",
        members: { create: [{ userId: ownerId, role: "OWNER" }] },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    await createCashBankAccount(owner(), {
      name: "V1.80 drawer",
      openingBalance: 0,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    const accounts = await getCashBankAccounts(workspaceId);
    cashAccountId = accounts.find((account) => !account.isBank)!.cashBankAccountId;
    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.80 meal",
        sku: `V180-${runId}`,
        stockQuantity: 100,
        costPrice: 250,
        sellingPrice: 1000,
      },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: `V1.80 ${runId}` });
    const item = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.80 meal",
      price: 1000,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("finding 5: rejects cash collection when no Restaurant cash shift is open", async () => {
    const before = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "cash_shifts"
      WHERE "workspaceId"=${workspaceId}::uuid AND "status"='OPEN'
    `;
    expect(before[0]?.count).toBe(0);

    const created = await order();
    await expect(recordRestaurantPaymentAtCollection(owner(), {
      orderId: created.id,
      cashBankAccountId: cashAccountId,
      method: "CASH",
      amount: 1000,
      idempotencyKey: `v180:no-shift:${randomUUID()}`,
    })).rejects.toThrow(/open.*cash shift|cash shift.*open/i);
    const paidState = await state(created.id);
    expect(paidState.payments).toHaveLength(0);
    expect(paidState.ledger.filter((row) => row.sourceType === "RECEIPT")).toHaveLength(0);
    expect(paidState.order.paymentStatus).toBe("UNPAID");
  }, 60_000);

  it("finding 3: keeps a dine-in table occupied when kitchen completion leaves the order unpaid", async () => {
    const table = await createRestaurantTable(owner(), { name: `V180-${runId.slice(0, 6)}`, capacity: 4 });
    const created = await order({ dineIn: true, tableId: table.id });
    let tableRows = await db.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "restaurant_tables" WHERE "id"=${table.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    expect(tableRows[0]?.status).toBe("OCCUPIED");
    await complete(created.id);

    const observed = await state(created.id);
    tableRows = await db.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "restaurant_tables" WHERE "id"=${table.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    expect(observed.order).toMatchObject({ status: "COMPLETED", paymentStatus: "UNPAID" });
    expect(observed.tickets).toEqual([{ status: "SERVED" }]);
    expect(tableRows).toEqual([{ status: "OCCUPIED" }]);
    expect(observed.ledger.filter((row) => row.sourceType === "SALE" && row.sourceId === created.id).length).toBeGreaterThanOrEqual(2);
    expect(observed.payments).toHaveLength(0);
  }, 60_000);

});
