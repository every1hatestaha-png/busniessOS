import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let recordPayment: typeof import("@/lib/server/restaurant-integrity")["recordRestaurantPayment"];
let voidPayment: typeof import("@/lib/server/restaurant-integrity")["voidRestaurantPayment"];
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let createReturn: typeof import("@/lib/server/restaurant-item-returns")["createRestaurantItemReturn"];
let reverseReturn: typeof import("@/lib/server/restaurant-return-reversals")["reverseRestaurantItemReturn"];

const runId = randomUUID();
let workspaceId = "";
let userId = "";
let cashId = "";
let menuItemId = "";
const actor = () => ({ workspaceId, userId, role: "OWNER" as const });

async function paymentSnapshot(paymentId: string) {
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM "restaurant_payments" WHERE "id"=${paymentId}::uuid
  `;
  return rows[0]!;
}

async function newOrder() {
  return createOrder(actor(), {
    fulfillmentType: "TAKEAWAY",
    items: [{ menuItemId, quantity: 1 }],
  });
}

async function complete(orderId: string) {
  for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
    await transition(actor(), orderId, status);
  }
}

describe("restaurant V1.75 payment evidence snapshot", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ createPosRestaurantOrder: createOrder } = await import("@/lib/server/restaurant-workspace"));
    ({
      transitionRestaurantOrderWithIntegrity: transition,
      recordRestaurantPayment: recordPayment,
      voidRestaurantPayment: voidPayment,
    } = await import("@/lib/server/restaurant-integrity"));
    ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ createRestaurantItemReturn: createReturn } = await import("@/lib/server/restaurant-item-returns"));
    ({ reverseRestaurantItemReturn: reverseReturn } = await import("@/lib/server/restaurant-return-reversals"));
    const { createRestaurantMenuCategory, createRestaurantMenuItem } = await import("@/lib/server/restaurant-workspace");
    const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");

    const user = await db.user.create({
      data: { clerkId: `v175-${runId}`, email: `v175-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Payment evidence ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(actor(), {
      name: "V1.75 drawer",
      openingBalance: 0,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceId)).find((row) => row.id === cash.id)!.cashBankAccountId;
    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V1.75 meal",
        sku: `V175-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createRestaurantMenuCategory(actor(), { name: `V1.75 ${runId}` });
    const item = await createRestaurantMenuItem(actor(), {
      categoryId: category.id,
      productId: product.id,
      name: "V1.75 meal",
      price: 200,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    // Immutable financial fixtures remain until the isolated CI database is discarded.
    if (db) await db.$disconnect();
  });

  it("rejects forged posting and receipt-attribution rewrites", async () => {
    const order = await newOrder();
    const payment = await recordPayment(actor(), {
      orderId: order.id,
      cashBankAccountId: cashId,
      method: "CASH",
      amount: 100,
      reference: "original reference",
      notes: "original note",
      idempotencyKey: `v175:unposted:${runId}`,
    });
    const before = await paymentSnapshot(payment.id);
    expect(before.postedAt).toBeNull();

    await expect(db.$executeRaw`
      UPDATE "restaurant_payments" SET "postedAt"=now() WHERE "id"=${payment.id}::uuid
    `).rejects.toThrow("Restaurant payment cannot be marked posted without balanced ledger evidence");
    await expect(db.$executeRaw`
      UPDATE "restaurant_payments" SET "createdById"=NULL WHERE "id"=${payment.id}::uuid
    `).rejects.toThrow("Restaurant payment evidence snapshot is immutable");
    await expect(db.$executeRaw`
      UPDATE "restaurant_payments" SET "reference"='rewritten' WHERE "id"=${payment.id}::uuid
    `).rejects.toThrow("Restaurant payment evidence snapshot is immutable");
    await expect(db.$executeRaw`
      UPDATE "restaurant_payments" SET "createdAt"="createdAt" + interval '1 second' WHERE "id"=${payment.id}::uuid
    `).rejects.toThrow("Restaurant payment evidence snapshot is immutable");
    expect(await paymentSnapshot(payment.id)).toEqual(before);
  });

  it("freezes posting and manager-void evidence once recorded", async () => {
    const order = await newOrder();
    const payment = await collect(actor(), {
      orderId: order.id,
      cashBankAccountId: cashId,
      method: "CASH",
      amount: 200,
      idempotencyKey: `v175:posted:${runId}`,
    });
    const posted = await paymentSnapshot(payment.id);
    expect(posted.postedAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "restaurant_payments" SET "postedAt"=NULL WHERE "id"=${payment.id}::uuid
    `).rejects.toThrow("Restaurant payment posting evidence is immutable once recorded");
    await voidPayment(actor(), payment.id, "Customer changed settlement method");
    const voided = await paymentSnapshot(payment.id);
    expect(voided.voidedAt).not.toBeNull();

    await expect(db.$executeRaw`
      UPDATE "restaurant_payments" SET "voidReason"='rewritten reason' WHERE "id"=${payment.id}::uuid
    `).rejects.toThrow("Restaurant payment void evidence is immutable without a compensating return reversal");
    await expect(db.$executeRaw`
      UPDATE "restaurant_payments" SET "voidedAt"=NULL, "voidedById"=NULL, "voidReason"=NULL
      WHERE "id"=${payment.id}::uuid
    `).rejects.toThrow("Restaurant payment void evidence is immutable without a compensating return reversal");
    expect(await paymentSnapshot(payment.id)).toEqual(voided);
  });

  it("allows receipt reactivation only through an immutable return reversal", async () => {
    const order = await newOrder();
    const payment = await collect(actor(), {
      orderId: order.id,
      cashBankAccountId: cashId,
      method: "CASH",
      amount: 200,
      idempotencyKey: `v175:return:${runId}`,
    });
    await complete(order.id);
    const itemRows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items"
      WHERE "restaurantOrderId"=${order.id}::uuid ORDER BY "createdAt", "id" LIMIT 1
    `;
    const returned = await createReturn(actor(), {
      orderId: order.id,
      reason: "Full item return for payment lifecycle proof",
      idempotencyKey: `v175:item-return:${runId}`,
      items: [{ orderItemId: itemRows[0]!.id, quantity: 1, restock: false }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });
    expect((await paymentSnapshot(payment.id)).voidedAt).not.toBeNull();

    await reverseReturn(actor(), returned.id, "Customer retained the item");
    const reactivated = await paymentSnapshot(payment.id);
    expect(reactivated.postedAt).not.toBeNull();
    expect(reactivated.voidedAt).toBeNull();
    expect(reactivated.voidedById).toBeNull();
    expect(reactivated.voidReason).toBeNull();
  }, 60_000);
});
