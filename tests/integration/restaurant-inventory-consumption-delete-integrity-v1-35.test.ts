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
const appRole = `restaurant_v135_${runId.replaceAll("-", "")}`;
let userId = "";
let workspaceId = "";
let cashId = "";
let productId = "";
let menuItemId = "";
const actor = () => ({ workspaceId, userId, role: "OWNER" as const });

async function snapshots(orderId: string) {
  return db.$queryRaw<Array<Record<string, unknown>>>`
    SELECT "id"::text, "workspaceId"::text, "restaurantOrderId"::text,
           "restaurantOrderItemId"::text, "productId", "warehouseId"::text,
           "quantity"::text, "unitCost"::text, "createdAt"::text
    FROM "restaurant_inventory_consumptions"
    WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid
    ORDER BY "productId", "id"
  `;
}

async function deleteAsApp(consumptionId: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${appRole}`);
    return tx.$executeRaw`DELETE FROM "restaurant_inventory_consumptions" WHERE "id"=${consumptionId}::uuid`;
  });
}

describe("restaurant V1.35 inventory consumption delete integrity", () => {
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

    const user = await db.user.create({ data: { clerkId: `v135-${runId}`, email: `v135-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: { name: `Inventory retention ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(actor(), {
      name: "V1.35 drawer", openingBalance: 1000, isBank: false,
      bankName: "", accountTitle: "", accountNumber: "", notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceId)).find((row) => row.id === cash.id)!.cashBankAccountId;

    const product = await db.product.create({
      data: { workspaceId, name: "V1.35 meal", sku: `V135-${runId}`, stockQuantity: 100, costPrice: 50, sellingPrice: 200 },
    });
    productId = product.id;
    const category = await createCategory(actor(), { name: `V1.35 ${runId}` });
    const item = await createMenuItem(actor(), { categoryId: category.id, productId, name: "V1.35 meal", price: 200 });
    menuItemId = item.id;

    await db.$executeRawUnsafe(`CREATE ROLE ${appRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT DELETE ON "restaurant_inventory_consumptions" TO ${appRole}`);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "restaurant_return_payment_allocations" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_return_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_returns" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
    // Isolated PostgreSQL superuser maintenance path remains intentionally valid.
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

  it("blocks application deletion before and after return/reversal while preserving historical operations", async () => {
    const order = await createOrder(actor(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 2 }] });
    const payment = await collect(actor(), {
      orderId: order.id, cashBankAccountId: cashId, method: "CASH", amount: 400,
      idempotencyKey: `pay:${randomUUID()}`,
    });
    for (const status of ["PREPARING", "READY", "COMPLETED"] as const) await transition(actor(), order.id, status);

    const before = await snapshots(order.id);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ productId, quantity: "2.0000", unitCost: "50.00" });
    const consumptionId = String(before[0]!.id);

    await expect(deleteAsApp(consumptionId)).rejects.toThrow("Restaurant inventory consumption history cannot be deleted");
    expect(await snapshots(order.id)).toEqual(before);

    const orderItems = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items"
      WHERE "restaurantOrderId"=${order.id}::uuid ORDER BY "createdAt", "id" LIMIT 1
    `;
    const stockBeforeReturn = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const returned = await createReturn(actor(), {
      orderId: order.id,
      reason: "Restock using retained history",
      idempotencyKey: `return:${randomUUID()}`,
      items: [{ orderItemId: orderItems[0]!.id, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toString())
      .toBe(stockBeforeReturn.stockQuantity.plus(1).toString());

    const reversal = await reverseReturn(actor(), returned.id, "Return entered in error");
    expect(reversal.alreadyReversed).toBe(false);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toString())
      .toBe(stockBeforeReturn.stockQuantity.toString());
    expect(await snapshots(order.id)).toEqual(before);

    await expect(deleteAsApp(consumptionId)).rejects.toThrow("Restaurant inventory consumption history cannot be deleted");
    expect(await snapshots(order.id)).toEqual(before);
    expect(await reverseReturn(actor(), returned.id, "Return entered in error"))
      .toMatchObject({ id: reversal.id, alreadyReversed: true });
    expect(await snapshots(order.id)).toEqual(before);
  }, 60_000);
});
