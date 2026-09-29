import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getCashBankAccounts: typeof import("@/lib/server/accounting")["getCashBankAccounts"];
let createRestaurantMenuCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createRestaurantMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createPosRestaurantOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transitionRestaurantOrderWithIntegrity: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let recordRestaurantPayment: typeof import("@/lib/server/restaurant-integrity")["recordRestaurantPayment"];
let refundRestaurantPayment: typeof import("@/lib/server/restaurant-refunds")["refundRestaurantPayment"];

const runId = randomUUID();
let userA = "";
let userB = "";
let workspaceA = "";
let workspaceB = "";
let menuItemId = "";
let cashAccountA = "";
let cashAccountB = "";

const ownerA = () => ({ workspaceId: workspaceA, role: "OWNER" as const, userId: userA });
const staffA = () => ({ workspaceId: workspaceA, role: "STAFF" as const, userId: userA });

async function enableRestaurant(workspaceId: string) {
  await db.$executeRaw`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    ON CONFLICT ("workspaceId", "moduleKey") DO UPDATE SET "enabled"=true, "updatedAt"=now()
  `;
}

async function readyAndComplete(orderId: string) {
  await transitionRestaurantOrderWithIntegrity(ownerA(), orderId, "PREPARING");
  await transitionRestaurantOrderWithIntegrity(ownerA(), orderId, "READY");
  await transitionRestaurantOrderWithIntegrity(ownerA(), orderId, "COMPLETED");
}

async function cleanupWorkspace(workspaceId: string) {
  await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
  await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_whatsapp_messages" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_order_item_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
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
}

describe("restaurant workspace v1.2 refund integrity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity, recordRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds"));

    const [a, b] = await Promise.all([
      db.user.create({ data: { clerkId: `restaurant-refund-a-${runId}`, email: `restaurant-refund-a-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `restaurant-refund-b-${runId}`, email: `restaurant-refund-b-${runId}@example.invalid` } }),
    ]);
    userA = a.id;
    userB = b.id;

    const [wa, wb] = await Promise.all([
      db.workspace.create({ data: { name: `Restaurant Refund A ${runId}`, vertical: "LEGACY", members: { create: { userId: userA, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `Restaurant Refund B ${runId}`, vertical: "LEGACY", members: { create: { userId: userB, role: "OWNER" } } } }),
    ]);
    workspaceA = wa.id;
    workspaceB = wb.id;
    await Promise.all([enableRestaurant(workspaceA), enableRestaurant(workspaceB)]);

    const [cashA, cashB] = await Promise.all([
      createCashBankAccount(ownerA(), { name: "Refund Cash A", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" }),
      createCashBankAccount({ workspaceId: workspaceB, role: "OWNER", userId: userB }, { name: "Refund Cash B", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" }),
    ]);
    const [accountsA, accountsB] = await Promise.all([
      getCashBankAccounts(workspaceA),
      getCashBankAccounts(workspaceB),
    ]);
    cashAccountA = accountsA.find((account) => account.id === cashA.id)!.cashBankAccountId;
    cashAccountB = accountsB.find((account) => account.id === cashB.id)!.cashBankAccountId;

    const product = await db.product.create({
      data: {
        workspaceId: workspaceA,
        name: "Refund Test Drink",
        sku: `REFUND-${runId}`,
        stockQuantity: 20,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    const category = await createRestaurantMenuCategory(ownerA(), { name: "Refund Menu" });
    const menuItem = await createRestaurantMenuItem(ownerA(), {
      categoryId: category.id,
      productId: product.id,
      name: "Refund Test Drink",
      price: 200,
    });
    menuItemId = menuItem.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await cleanupWorkspace(workspaceA);
    await cleanupWorkspace(workspaceB);
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await db.$disconnect();
  }, 60_000);

  it("refunds a posted payment exactly once and preserves a durable audit trail", async () => {
    const order = await createPosRestaurantOrder(ownerA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const payment = await recordRestaurantPayment(ownerA(), {
      orderId: order.id,
      cashBankAccountId: cashAccountA,
      method: "CASH",
      amount: 200,
      idempotencyKey: `refund:${runId}:payment-a`,
    });
    await readyAndComplete(order.id);

    const cashBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountA } });
    const result = await refundRestaurantPayment(ownerA(), {
      paymentId: payment.id,
      reason: "Customer returned after settlement",
      idempotencyKey: `refund:${runId}:request-a`,
    });
    const retry = await refundRestaurantPayment(ownerA(), {
      paymentId: payment.id,
      reason: "Customer returned after settlement",
      idempotencyKey: `refund:${runId}:request-a`,
    });
    expect(retry).toMatchObject({ id: result.id, idempotent: true });

    const [cashAfter, paymentRows, orderRows, refundRows, reversals, audits] = await Promise.all([
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountA } }),
      db.$queryRaw<Array<{ voidedAt: Date | null; voidReason: string | null }>>`
        SELECT "voidedAt", "voidReason" FROM "restaurant_payments" WHERE "id"=${payment.id}::uuid
      `,
      db.$queryRaw<Array<{ paymentStatus: string }>>`
        SELECT "paymentStatus" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
      `,
      db.$queryRaw<Array<{ id: string; amount: unknown; reason: string }>>`
        SELECT "id"::text AS "id", "amount", "reason" FROM "restaurant_refunds"
        WHERE "workspaceId"=${workspaceA}::uuid AND "restaurantPaymentId"=${payment.id}::uuid
      `,
      db.generalLedgerEntry.findMany({
        where: {
          workspaceId: workspaceA,
          reversalOfId: { not: null },
          reversalReason: { contains: "Restaurant refund" },
        },
      }),
      db.auditLog.findMany({
        where: {
          workspaceId: workspaceA,
          action: "restaurant.payment.refunded",
          entityId: result.id,
        },
      }),
    ]);

    expect(Number(cashBefore.currentBalance) - Number(cashAfter.currentBalance)).toBe(200);
    expect(paymentRows[0]?.voidedAt).toBeTruthy();
    expect(paymentRows[0]?.voidReason).toContain("Refunded:");
    expect(orderRows[0]?.paymentStatus).toBe("UNPAID");
    expect(refundRows).toHaveLength(1);
    expect(Number(refundRows[0]?.amount)).toBe(200);
    expect(reversals.length).toBeGreaterThanOrEqual(2);
    expect(audits).toHaveLength(1);
  });

  it("rejects refunds before completion and blocks staff from refunding", async () => {
    const order = await createPosRestaurantOrder(ownerA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const payment = await recordRestaurantPayment(ownerA(), {
      orderId: order.id,
      cashBankAccountId: cashAccountA,
      method: "CASH",
      amount: 200,
      idempotencyKey: `refund:${runId}:payment-b`,
    });

    await expect(refundRestaurantPayment(ownerA(), {
      paymentId: payment.id,
      reason: "Order is not completed yet",
      idempotencyKey: `refund:${runId}:not-complete`,
    })).rejects.toThrow("Only payments on completed restaurant orders can be refunded");

    await readyAndComplete(order.id);
    await expect(refundRestaurantPayment(staffA(), {
      paymentId: payment.id,
      reason: "Unauthorized refund attempt",
      idempotencyKey: `refund:${runId}:staff`,
    })).rejects.toThrow("Manager access is required");
  });

  it("rejects mismatched tenant refund references at the database boundary", async () => {
    const order = await createPosRestaurantOrder(ownerA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const payment = await recordRestaurantPayment(ownerA(), {
      orderId: order.id,
      cashBankAccountId: cashAccountA,
      method: "CASH",
      amount: 200,
      idempotencyKey: `refund:${runId}:payment-cross`,
    });
    await readyAndComplete(order.id);

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_refunds" (
        "workspaceId", "restaurantOrderId", "restaurantPaymentId", "cashBankAccountId",
        "amount", "reason", "idempotencyKey"
      ) VALUES (
        ${workspaceA}::uuid, ${order.id}::uuid, ${payment.id}::uuid, ${cashAccountB},
        200, 'Cross tenant attempt', ${`refund:${runId}:cross-db`}
      )
    `).rejects.toThrow("mismatched restaurant refund payment reference rejected");
  });
});