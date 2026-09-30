import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let collect: typeof import("@/lib/server/restaurant-payments-immediate")["recordRestaurantPaymentAtCollection"];
let createReturn: typeof import("@/lib/server/restaurant-item-returns")["createRestaurantItemReturn"];
let reverseReturn: typeof import("@/lib/server/restaurant-return-reversals")["reverseRestaurantItemReturn"];

const runId = randomUUID();
const appRole = `restaurant_v133_${runId.replaceAll("-", "")}`;
let userId = "";
let workspaceId = "";
let cashId = "";
let productId = "";
let menuItemId = "";
const actor = () => ({ workspaceId, userId, role: "OWNER" as const });

async function snapshot(orderId: string, paymentId: string) {
  const [returns, items, allocations, payment, order, cash, product, ledger, inventoryTx] = await Promise.all([
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "id"::text, "returnNumber", "reason", "total"::text, "inventoryCost"::text,
             "isReversal", "reversalOfId"::text, "reversalReason", "createdAt"::text
      FROM "restaurant_returns"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid
      ORDER BY "createdAt", "id"
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT i."id"::text, i."restaurantReturnId"::text, i."restaurantOrderItemId"::text,
             i."quantity"::text, i."total"::text, i."inventoryCost"::text, i."restocked", i."isReversal"
      FROM "restaurant_return_items" i
      INNER JOIN "restaurant_returns" r ON r."id"=i."restaurantReturnId"
      WHERE r."workspaceId"=${workspaceId}::uuid AND r."restaurantOrderId"=${orderId}::uuid
      ORDER BY i."createdAt", i."id"
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT a."id"::text, a."restaurantReturnId"::text, a."restaurantPaymentId"::text,
             a."amount"::text, a."isReversal"
      FROM "restaurant_return_payment_allocations" a
      INNER JOIN "restaurant_returns" r ON r."id"=a."restaurantReturnId"
      WHERE r."workspaceId"=${workspaceId}::uuid AND r."restaurantOrderId"=${orderId}::uuid
      ORDER BY a."createdAt", a."id"
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "id"::text, "amount"::text, "voidedAt"::text, "voidReason"
      FROM "restaurant_payments" WHERE "id"=${paymentId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "status", "paymentStatus" FROM "restaurant_orders"
      WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
    `,
    db.cashBankAccount.findUniqueOrThrow({ where: { id: cashId }, select: { currentBalance: true } }),
    db.product.findUniqueOrThrow({ where: { id: productId }, select: { stockQuantity: true } }),
    db.generalLedgerEntry.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
    db.inventoryTransaction.findMany({ where: { workspaceId, productId }, orderBy: { id: "asc" } }),
  ]);
  return {
    returns,
    items,
    allocations,
    payment,
    order,
    cash: cash.currentBalance.toString(),
    stock: product.stockQuantity.toString(),
    ledger,
    inventoryTx,
  };
}

async function deleteAsApp(sql: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${appRole}`);
    return tx.$executeRawUnsafe(sql);
  });
}

describe("restaurant V1.33 return delete integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createOrder,
    } = await import("@/lib/server/restaurant-workspace"));
    ({ transitionRestaurantOrderWithIntegrity: transition } = await import("@/lib/server/restaurant-integrity"));
    ({ recordRestaurantPaymentAtCollection: collect } = await import("@/lib/server/restaurant-payments-immediate"));
    ({ createRestaurantItemReturn: createReturn } = await import("@/lib/server/restaurant-item-returns"));
    ({ reverseRestaurantItemReturn: reverseReturn } = await import("@/lib/server/restaurant-return-reversals"));
    const { createCashBankAccount, getCashBankAccounts } = await import("@/lib/server/accounting");

    const user = await db.user.create({ data: { clerkId: `v133-${runId}`, email: `v133-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: { name: `Return retention ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(actor(), {
      name: "V1.33 drawer", openingBalance: 1000, isBank: false,
      bankName: "", accountTitle: "", accountNumber: "", notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceId)).find((row) => row.id === cash.id)!.cashBankAccountId;

    const product = await db.product.create({
      data: { workspaceId, name: "V1.33 meal", sku: `V133-${runId}`, stockQuantity: 100, costPrice: 50, sellingPrice: 200 },
    });
    productId = product.id;
    const category = await createCategory(actor(), { name: `V1.33 ${runId}` });
    const menuItem = await createMenuItem(actor(), { categoryId: category.id, productId, name: "V1.33 meal", price: 200 });
    menuItemId = menuItem.id;

    await db.$executeRawUnsafe(`CREATE ROLE ${appRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(
      `GRANT DELETE ON "restaurant_returns", "restaurant_return_items", "restaurant_return_payment_allocations" TO ${appRole}`,
    );
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    // CI runs as the isolated PostgreSQL superuser. Keep that unavoidable DBA
    // maintenance path so teardown is possible without disabling the guards.
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "restaurant_return_payment_allocations" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_return_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_returns" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_inventory_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$executeRawUnsafe(`DROP OWNED BY ${appRole}`);
    await db.$executeRawUnsafe(`DROP ROLE ${appRole}`);
    await db.$disconnect();
  }, 60_000);

  it("blocks application deletion of original and reversal return history while preserving legitimate reversal", async () => {
    const order = await createOrder(actor(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 2 }] });
    const payment = await collect(actor(), {
      orderId: order.id, cashBankAccountId: cashId, method: "CASH", amount: 400,
      idempotencyKey: `pay:${randomUUID()}`,
    });
    for (const status of ["PREPARING", "READY", "COMPLETED"] as const) await transition(actor(), order.id, status);
    const orderItems = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items"
      WHERE "restaurantOrderId"=${order.id}::uuid ORDER BY "createdAt", "id" LIMIT 1
    `;

    const original = await createReturn(actor(), {
      orderId: order.id,
      reason: "Customer returned one item",
      idempotencyKey: `return:${randomUUID()}`,
      items: [{ orderItemId: orderItems[0]!.id, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });
    const reversal = await reverseReturn(actor(), original.id, "Return entered in error");
    expect(reversal.alreadyReversed).toBe(false);

    const before = await snapshot(order.id, payment.id);
    expect(before.returns).toHaveLength(2);
    expect(before.items).toHaveLength(2);
    expect(before.allocations).toHaveLength(2);

    const originalReturn = before.returns.find((row) => row.isReversal === false)!;
    const reversalReturn = before.returns.find((row) => row.isReversal === true)!;
    const originalItem = before.items.find((row) => row.isReversal === false)!;
    const reversalItem = before.items.find((row) => row.isReversal === true)!;
    const originalAllocation = before.allocations.find((row) => row.isReversal === false)!;
    const reversalAllocation = before.allocations.find((row) => row.isReversal === true)!;

    const attempts = [
      {
        sql: `DELETE FROM "restaurant_return_payment_allocations" WHERE "id"='${String(originalAllocation.id)}'::uuid`,
        message: "Restaurant return payment allocation history cannot be deleted",
      },
      {
        sql: `DELETE FROM "restaurant_return_items" WHERE "id"='${String(originalItem.id)}'::uuid`,
        message: "Restaurant return item history cannot be deleted",
      },
      {
        sql: `DELETE FROM "restaurant_returns" WHERE "id"='${String(originalReturn.id)}'::uuid`,
        message: "Restaurant return history cannot be deleted",
      },
      {
        sql: `DELETE FROM "restaurant_return_payment_allocations" WHERE "id"='${String(reversalAllocation.id)}'::uuid`,
        message: "Restaurant return payment allocation history cannot be deleted",
      },
      {
        sql: `DELETE FROM "restaurant_return_items" WHERE "id"='${String(reversalItem.id)}'::uuid`,
        message: "Restaurant return item history cannot be deleted",
      },
      {
        sql: `DELETE FROM "restaurant_returns" WHERE "id"='${String(reversalReturn.id)}'::uuid`,
        message: "Restaurant return history cannot be deleted",
      },
    ];

    for (const attempt of attempts) {
      await expect(deleteAsApp(attempt.sql)).rejects.toThrow(attempt.message);
      expect(await snapshot(order.id, payment.id)).toEqual(before);
    }

    // A malicious child-first wipe cannot get past its first step.
    await expect(deleteAsApp(
      `DELETE FROM "restaurant_return_payment_allocations" WHERE "restaurantReturnId"='${String(originalReturn.id)}'::uuid`,
    )).rejects.toThrow("Restaurant return payment allocation history cannot be deleted");
    expect(await snapshot(order.id, payment.id)).toEqual(before);

    const retry = await reverseReturn(actor(), original.id, "Return entered in error");
    expect(retry).toMatchObject({ id: reversal.id, alreadyReversed: true });
    expect(await snapshot(order.id, payment.id)).toEqual(before);
  }, 60_000);
});
