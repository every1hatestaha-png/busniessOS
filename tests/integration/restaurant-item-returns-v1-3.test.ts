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
let createRestaurantItemReturn: typeof import("@/lib/server/restaurant-item-returns")["createRestaurantItemReturn"];

const runId = randomUUID();
let userA = "";
let userB = "";
let workspaceA = "";
let workspaceB = "";
let menuItemId = "";
let productId = "";
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

async function getOrderItemId(orderId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id" FROM "restaurant_order_items"
    WHERE "restaurantOrderId"=${orderId}::uuid
    ORDER BY "createdAt", "id" LIMIT 1
  `;
  return rows[0]!.id;
}

async function cleanupWorkspace(workspaceId: string) {
  await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
  await db.$executeRaw`DELETE FROM "restaurant_return_payment_allocations" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_return_items" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_returns" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_inventory_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
  await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
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
}

describe("restaurant workspace v1.3 item return integrity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting"));
    ({ createRestaurantMenuCategory, createRestaurantMenuItem, createPosRestaurantOrder } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity, recordRestaurantPayment } = await import("@/lib/server/restaurant-integrity"));
    ({ refundRestaurantPayment } = await import("@/lib/server/restaurant-refunds"));
    ({ createRestaurantItemReturn } = await import("@/lib/server/restaurant-item-returns"));

    const [a, b] = await Promise.all([
      db.user.create({ data: { clerkId: `restaurant-return-a-${runId}`, email: `restaurant-return-a-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `restaurant-return-b-${runId}`, email: `restaurant-return-b-${runId}@example.invalid` } }),
    ]);
    userA = a.id;
    userB = b.id;

    const [wa, wb] = await Promise.all([
      db.workspace.create({ data: { name: `Restaurant Return A ${runId}`, vertical: "LEGACY", members: { create: { userId: userA, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `Restaurant Return B ${runId}`, vertical: "LEGACY", members: { create: { userId: userB, role: "OWNER" } } } }),
    ]);
    workspaceA = wa.id;
    workspaceB = wb.id;
    await Promise.all([enableRestaurant(workspaceA), enableRestaurant(workspaceB)]);

    const [cashA, cashB] = await Promise.all([
      createCashBankAccount(ownerA(), { name: "Return Cash A", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" }),
      createCashBankAccount({ workspaceId: workspaceB, role: "OWNER", userId: userB }, { name: "Return Cash B", openingBalance: 0, isBank: false, bankName: "", accountTitle: "", accountNumber: "", notes: "" }),
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
        name: "Return Test Drink",
        sku: `RETURN-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    productId = product.id;
    const category = await createRestaurantMenuCategory(ownerA(), { name: "Return Menu" });
    const menuItem = await createRestaurantMenuItem(ownerA(), {
      categoryId: category.id,
      productId: product.id,
      name: "Return Test Drink",
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

  it("partially returns a completed order, refunds cash, and keeps net payment status paid", async () => {
    const order = await createPosRestaurantOrder(ownerA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 2 }],
    });
    const payment = await recordRestaurantPayment(ownerA(), {
      orderId: order.id,
      cashBankAccountId: cashAccountA,
      method: "CASH",
      amount: 400,
      idempotencyKey: `return:${runId}:payment-a`,
    });
    await readyAndComplete(order.id);
    const orderItemId = await getOrderItemId(order.id);
    const cashBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountA } });
    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: productId } });

    const result = await createRestaurantItemReturn(ownerA(), {
      orderId: order.id,
      reason: "One item returned by customer",
      idempotencyKey: `return:${runId}:request-a`,
      items: [{ orderItemId, quantity: 1, restock: false }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });
    const retry = await createRestaurantItemReturn(ownerA(), {
      orderId: order.id,
      reason: "One item returned by customer",
      idempotencyKey: `return:${runId}:request-a`,
      items: [{ orderItemId, quantity: 1, restock: false }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });
    expect(retry).toMatchObject({ id: result.id, idempotent: true });

    const [cashAfter, stockAfter, orderRows, paymentRows, returnRows, auditRows] = await Promise.all([
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashAccountA } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.$queryRaw<Array<{ paymentStatus: string }>>`
        SELECT "paymentStatus" FROM "restaurant_orders" WHERE "id"=${order.id}::uuid
      `,
      db.$queryRaw<Array<{ voidedAt: Date | null }>>`
        SELECT "voidedAt" FROM "restaurant_payments" WHERE "id"=${payment.id}::uuid
      `,
      db.$queryRaw<Array<{ total: unknown; inventoryCost: unknown }>>`
        SELECT "total", "inventoryCost" FROM "restaurant_returns" WHERE "id"=${result.id}::uuid
      `,
      db.auditLog.findMany({ where: { workspaceId: workspaceA, action: "restaurant.return.created", entityId: result.id } }),
    ]);

    expect(Number(cashBefore.currentBalance) - Number(cashAfter.currentBalance)).toBe(200);
    expect(Number(stockAfter.stockQuantity)).toBe(Number(stockBefore.stockQuantity));
    expect(orderRows[0]?.paymentStatus).toBe("PAID");
    expect(paymentRows[0]?.voidedAt).toBeNull();
    expect(Number(returnRows[0]?.total)).toBe(200);
    expect(Number(returnRows[0]?.inventoryCost)).toBe(0);
    expect(auditRows).toHaveLength(1);
  });

  it("restocks from the historical snapshot and reverses historical COGS, not the current product cost", async () => {
    await db.product.update({ where: { id: productId }, data: { costPrice: 50 } });
    const order = await createPosRestaurantOrder(ownerA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const payment = await recordRestaurantPayment(ownerA(), {
      orderId: order.id,
      cashBankAccountId: cashAccountA,
      method: "CASH",
      amount: 200,
      idempotencyKey: `return:${runId}:payment-b`,
    });
    await readyAndComplete(order.id);
    const orderItemId = await getOrderItemId(order.id);
    const snapshots = await db.$queryRaw<Array<{ quantity: unknown; unitCost: unknown }>>`
      SELECT "quantity", "unitCost" FROM "restaurant_inventory_consumptions"
      WHERE "workspaceId"=${workspaceA}::uuid AND "restaurantOrderItemId"=${orderItemId}::uuid
    `;
    expect(snapshots).toHaveLength(1);
    expect(Number(snapshots[0]?.unitCost)).toBe(50);

    await db.product.update({ where: { id: productId }, data: { costPrice: 999 } });
    const stockBefore = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const result = await createRestaurantItemReturn(ownerA(), {
      orderId: order.id,
      reason: "Unopened item returned to stock",
      idempotencyKey: `return:${runId}:request-b`,
      items: [{ orderItemId, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });
    const [stockAfter, returnRows] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.$queryRaw<Array<{ inventoryCost: unknown }>>`
        SELECT "inventoryCost" FROM "restaurant_returns" WHERE "id"=${result.id}::uuid
      `,
    ]);
    expect(Number(stockAfter.stockQuantity) - Number(stockBefore.stockQuantity)).toBe(1);
    expect(Number(returnRows[0]?.inventoryCost)).toBe(50);
  });

  it("rejects over-returns, blocks staff, and prevents a later full refund on a partially refunded payment", async () => {
    const order = await createPosRestaurantOrder(ownerA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 2 }],
    });
    const payment = await recordRestaurantPayment(ownerA(), {
      orderId: order.id,
      cashBankAccountId: cashAccountA,
      method: "CASH",
      amount: 400,
      idempotencyKey: `return:${runId}:payment-c`,
    });
    await readyAndComplete(order.id);
    const orderItemId = await getOrderItemId(order.id);

    await expect(createRestaurantItemReturn(staffA(), {
      orderId: order.id,
      reason: "Unauthorized item return",
      idempotencyKey: `return:${runId}:staff`,
      items: [{ orderItemId, quantity: 1 }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    })).rejects.toThrow("Manager access is required");

    await createRestaurantItemReturn(ownerA(), {
      orderId: order.id,
      reason: "Partial item return",
      idempotencyKey: `return:${runId}:request-c`,
      items: [{ orderItemId, quantity: 1 }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });

    await expect(createRestaurantItemReturn(ownerA(), {
      orderId: order.id,
      reason: "Over return attempt",
      idempotencyKey: `return:${runId}:over-c`,
      items: [{ orderItemId, quantity: 2 }],
      paymentAllocations: [{ paymentId: payment.id, amount: 400 }],
    })).rejects.toThrow("Return quantity exceeds the remaining quantity");

    await expect(refundRestaurantPayment(ownerA(), {
      paymentId: payment.id,
      reason: "Double refund attempt",
      idempotencyKey: `return:${runId}:full-after-partial`,
    })).rejects.toThrow();
  });

  it("rejects cross-workspace payment allocation references at the database boundary", async () => {
    const order = await createPosRestaurantOrder(ownerA(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 1 }],
    });
    const payment = await recordRestaurantPayment(ownerA(), {
      orderId: order.id,
      cashBankAccountId: cashAccountA,
      method: "CASH",
      amount: 200,
      idempotencyKey: `return:${runId}:payment-cross`,
    });
    await readyAndComplete(order.id);
    const orderItemId = await getOrderItemId(order.id);
    const returnId = randomUUID();

    await db.$executeRaw`
      INSERT INTO "restaurant_returns" (
        "id", "workspaceId", "restaurantOrderId", "returnNumber", "reason",
        "subtotal", "discountAmount", "taxAmount", "total", "inventoryCost",
        "requestFingerprint"
      ) VALUES (
        ${returnId}::uuid, ${workspaceA}::uuid, ${order.id}::uuid, ${`RR-CROSS-${runId}`},
        'Cross tenant guard setup', 200, 0, 0, 200, 0, ${runId}
      )
    `;
    await db.$executeRaw`
      INSERT INTO "restaurant_return_items" (
        "workspaceId", "restaurantReturnId", "restaurantOrderItemId", "quantity",
        "subtotal", "discountAmount", "taxAmount", "total", "inventoryCost", "restocked"
      ) VALUES (
        ${workspaceA}::uuid, ${returnId}::uuid, ${orderItemId}::uuid, 1, 200, 0, 0, 200, 0, false
      )
    `;

    const foreignPaymentId = randomUUID();
    await db.$executeRaw`
      INSERT INTO "restaurant_payments" (
        "id", "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "postedAt"
      ) VALUES (
        ${foreignPaymentId}::uuid, ${workspaceA}::uuid, ${order.id}::uuid, ${cashAccountB}, 'CASH', 200, now()
      )
    `.catch(() => undefined);

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_return_payment_allocations" (
        "workspaceId", "restaurantReturnId", "restaurantPaymentId", "amount"
      ) VALUES (
        ${workspaceB}::uuid, ${returnId}::uuid, ${payment.id}::uuid, 200
      )
    `).rejects.toThrow("Cross-workspace restaurant return payment allocation rejected");
  });
});
