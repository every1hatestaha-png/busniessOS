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
let refundRestaurantPayment: typeof import("@/lib/server/restaurant-refunds")["refundRestaurantPayment"];

const runId = randomUUID();
let workspaceId = "";
let ownerId = "";
let menuItemId = "";
let bankAccountId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });

async function tableStatus(tableId: string) {
  const rows = await db.$queryRaw<Array<{ status: string }>>`
    SELECT "status"
    FROM "restaurant_tables"
    WHERE "id"=${tableId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return rows[0]?.status;
}

async function createDineIn(tableId: string) {
  return createPosRestaurantOrder(owner(), {
    fulfillmentType: "DINE_IN",
    restaurantTableId: tableId,
    items: [{ menuItemId, quantity: 1 }],
  });
}

async function advanceToReady(orderId: string) {
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "PREPARING");
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "READY");
}

async function complete(orderId: string) {
  await advanceToReady(orderId);
  await transitionRestaurantOrderWithIntegrity(owner(), orderId, "COMPLETED");
}

async function pay(orderId: string, amount: number) {
  return recordRestaurantPaymentAtCollection(owner(), {
    orderId,
    cashBankAccountId: bankAccountId,
    method: "BANK_TRANSFER",
    amount,
    idempotencyKey: `v182:payment:${randomUUID()}`,
  });
}

async function paymentStatus(orderId: string) {
  const rows = await db.$queryRaw<Array<{ status: string; paymentStatus: string; tableReleasedAt: Date | null }>>`
    SELECT "status", "paymentStatus", "tableReleasedAt"
    FROM "restaurant_orders"
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return rows[0]!;
}

describe("Restaurant V1.82 table settlement", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantTable } = await import("@/lib/server/industry-modules"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity } = await import("@/lib/server/restaurant-integrity"));
    ({ recordRestaurantPaymentAtCollection } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds"));

    const user = await db.user.create({
      data: { clerkId: `v182-owner-${runId}`, email: `v182-owner-${runId}@example.invalid` },
    });
    ownerId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `V1.82 settlement ${runId}`,
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
      name: "V1.82 settlement bank",
      openingBalance: 0,
      isBank: true,
      bankName: "Test Bank",
      accountTitle: "V1.82",
      accountNumber: `V182-${runId.slice(0, 8)}`,
      notes: "",
    });
    const accounts = await getCashBankAccounts(workspaceId);
    bankAccountId = accounts.find((account) => account.isBank)!.cashBankAccountId;

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.82 meal",
        sku: `V182-${runId}`,
        stockQuantity: 100,
        costPrice: 250,
        sellingPrice: 1000,
      },
    });
    const category = await createRestaurantMenuCategory(owner(), { name: `V1.82 ${runId}` });
    const item = await createRestaurantMenuItem(owner(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.82 meal",
      price: 1000,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("keeps an unpaid completed dine-in table occupied and the DB guard fails closed", async () => {
    const table = await createRestaurantTable(owner(), { name: `V182-U-${runId.slice(0, 6)}`, capacity: 4 });
    const order = await createDineIn(table.id);

    await complete(order.id);
    expect(await paymentStatus(order.id)).toMatchObject({ status: "COMPLETED", paymentStatus: "UNPAID" });
    expect(await tableStatus(table.id)).toBe("OCCUPIED");

    await db.$executeRaw`
      UPDATE "restaurant_tables"
      SET "status"='AVAILABLE', "updatedAt"=now()
      WHERE "id"=${table.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `;
    expect(await tableStatus(table.id)).toBe("OCCUPIED");
  }, 60_000);

  it("keeps a partially paid completed dine-in table occupied", async () => {
    const table = await createRestaurantTable(owner(), { name: `V182-P-${runId.slice(0, 6)}`, capacity: 4 });
    const order = await createDineIn(table.id);

    await pay(order.id, 500);
    await complete(order.id);

    expect(await paymentStatus(order.id)).toMatchObject({ status: "COMPLETED", paymentStatus: "PARTIALLY_PAID" });
    expect(await tableStatus(table.id)).toBe("OCCUPIED");
  }, 60_000);

  it("releases the table when final settlement arrives after kitchen completion", async () => {
    const table = await createRestaurantTable(owner(), { name: `V182-L-${runId.slice(0, 6)}`, capacity: 4 });
    const order = await createDineIn(table.id);

    await complete(order.id);
    expect(await tableStatus(table.id)).toBe("OCCUPIED");

    await pay(order.id, 1000);

    const settled = await paymentStatus(order.id);
    expect(settled).toMatchObject({ status: "COMPLETED", paymentStatus: "PAID" });
    expect(settled.tableReleasedAt).not.toBeNull();
    expect(await tableStatus(table.id)).toBe("AVAILABLE");

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders"
      SET "tableReleasedAt"=NULL
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow(/table release evidence is immutable/i);
  }, 60_000);

  it("does not let a post-service refund poison later seating on the same table", async () => {
    const table = await createRestaurantTable(owner(), { name: `V182-R-${runId.slice(0, 6)}`, capacity: 4 });
    const first = await createDineIn(table.id);
    const payment = await pay(first.id, 1000);
    await complete(first.id);

    expect(await tableStatus(table.id)).toBe("AVAILABLE");
    expect((await paymentStatus(first.id)).tableReleasedAt).not.toBeNull();

    await refundRestaurantPayment(owner(), {
      paymentId: payment.id,
      reason: "Post-service customer refund",
      idempotencyKey: `v182:refund:${randomUUID()}`,
    });

    expect(await paymentStatus(first.id)).toMatchObject({ status: "COMPLETED", paymentStatus: "UNPAID" });
    expect(await tableStatus(table.id)).toBe("AVAILABLE");

    const second = await createDineIn(table.id);
    await pay(second.id, 1000);
    await complete(second.id);

    expect(await paymentStatus(second.id)).toMatchObject({ status: "COMPLETED", paymentStatus: "PAID" });
    expect(await tableStatus(table.id)).toBe("AVAILABLE");
  }, 60_000);

  it("does not release on payment before food completion and releases only after completion", async () => {
    const table = await createRestaurantTable(owner(), { name: `V182-F-${runId.slice(0, 6)}`, capacity: 4 });
    const order = await createDineIn(table.id);

    await pay(order.id, 1000);
    expect(await tableStatus(table.id)).toBe("OCCUPIED");

    await advanceToReady(order.id);
    expect(await tableStatus(table.id)).toBe("OCCUPIED");

    await transitionRestaurantOrderWithIntegrity(owner(), order.id, "COMPLETED");
    expect(await tableStatus(table.id)).toBe("AVAILABLE");
  }, 60_000);

  it("does not free a table while another live order still occupies it", async () => {
    const table = await createRestaurantTable(owner(), { name: `V182-M-${runId.slice(0, 6)}`, capacity: 4 });
    const first = await createDineIn(table.id);
    const second = await createDineIn(table.id);

    await complete(first.id);
    await pay(first.id, 1000);
    expect(await tableStatus(table.id)).toBe("OCCUPIED");

    await transitionRestaurantOrderWithIntegrity(owner(), second.id, "CANCELLED");
    expect(await tableStatus(table.id)).toBe("AVAILABLE");
  }, 60_000);

  it("converges correctly when final payment races kitchen completion", async () => {
    const table = await createRestaurantTable(owner(), { name: `V182-C-${runId.slice(0, 6)}`, capacity: 4 });
    const order = await createDineIn(table.id);
    await advanceToReady(order.id);

    await Promise.all([
      transitionRestaurantOrderWithIntegrity(owner(), order.id, "COMPLETED"),
      pay(order.id, 1000),
    ]);

    expect(await paymentStatus(order.id)).toMatchObject({ status: "COMPLETED", paymentStatus: "PAID" });
    expect(await tableStatus(table.id)).toBe("AVAILABLE");
  }, 60_000);
});
