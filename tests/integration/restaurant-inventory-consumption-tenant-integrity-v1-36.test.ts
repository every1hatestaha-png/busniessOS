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
let userId = "";
let workspaceA = "";
let workspaceB = "";
let cashId = "";
let productA = "";
let productB = "";
let warehouseB = "";
let menuItemId = "";
const actor = () => ({ workspaceId: workspaceA, userId, role: "OWNER" as const });

async function snapshots(orderId: string) {
  return db.$queryRaw<Array<{
    id: string;
    workspaceId: string;
    restaurantOrderId: string;
    restaurantOrderItemId: string;
    productId: string;
    warehouseId: string | null;
    quantity: string;
    unitCost: string;
  }>>`
    SELECT "id"::text AS "id", "workspaceId"::text AS "workspaceId",
           "restaurantOrderId"::text AS "restaurantOrderId",
           "restaurantOrderItemId"::text AS "restaurantOrderItemId",
           "productId", "warehouseId"::text AS "warehouseId",
           "quantity"::text AS "quantity", "unitCost"::text AS "unitCost"
    FROM "restaurant_inventory_consumptions"
    WHERE "restaurantOrderId"=${orderId}::uuid
    ORDER BY "productId", "id"
  `;
}

describe("restaurant V1.36 inventory consumption tenant integrity", () => {
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

    const user = await db.user.create({
      data: { clerkId: `v136-${runId}`, email: `v136-${runId}@example.invalid` },
    });
    userId = user.id;
    const [a, b] = await Promise.all([
      db.workspace.create({
        data: { name: `Consumption tenant A ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
      }),
      db.workspace.create({
        data: { name: `Consumption tenant B ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } },
      }),
    ]);
    workspaceA = a.id;
    workspaceB = b.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceA}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(actor(), {
      name: "V1.36 drawer",
      openingBalance: 1000,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceA)).find((row) => row.id === cash.id)!.cashBankAccountId;

    const [aProduct, bProduct] = await Promise.all([
      db.product.create({
        data: { workspaceId: workspaceA, name: "V1.36 meal", sku: `V136-A-${runId}`, stockQuantity: 100, costPrice: 50, sellingPrice: 200 },
      }),
      db.product.create({
        data: { workspaceId: workspaceB, name: "Foreign V1.36 meal", sku: `V136-B-${runId}`, stockQuantity: 100, costPrice: 999, sellingPrice: 999 },
      }),
    ]);
    productA = aProduct.id;
    productB = bProduct.id;

    const warehouseRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,false,true) RETURNING "id"::text AS "id"',
      workspaceB,
      `Foreign warehouse ${runId}`,
      `V136-${runId.slice(0, 8)}`,
    );
    warehouseB = warehouseRows[0]!.id;

    const category = await createCategory(actor(), { name: `V1.36 ${runId}` });
    const item = await createMenuItem(actor(), {
      categoryId: category.id,
      productId: productA,
      name: "V1.36 meal",
      price: 200,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    for (const workspaceId of [workspaceA, workspaceB]) {
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
      await db.$executeRaw`DELETE FROM "warehouse_stocks" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.$executeRaw`DELETE FROM "warehouses" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.product.deleteMany({ where: { workspaceId } });
      await db.cashBankAccount.deleteMany({ where: { workspaceId } });
      await db.account.deleteMany({ where: { workspaceId } });
      await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
      await db.auditLog.deleteMany({ where: { workspaceId } });
    }
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("rejects cross-tenant and foreign-parent consumption inserts without breaking legitimate return history", async () => {
    const order = await createOrder(actor(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 2 }] });
    const payment = await collect(actor(), {
      orderId: order.id,
      cashBankAccountId: cashId,
      method: "CASH",
      amount: 400,
      idempotencyKey: `pay:${randomUUID()}`,
    });
    for (const status of ["PREPARING", "READY", "COMPLETED"] as const) {
      await transition(actor(), order.id, status);
    }

    const before = await snapshots(order.id);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      workspaceId: workspaceA,
      productId: productA,
      warehouseId: null,
      quantity: "2.0000",
      unitCost: "50.00",
    });
    const orderItemId = before[0]!.restaurantOrderItemId;

    const otherOrder = await createOrder(actor(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 1 }] });
    const otherItems = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items"
      WHERE "restaurantOrderId"=${otherOrder.id}::uuid ORDER BY "createdAt", "id" LIMIT 1
    `;
    const otherOrderItemId = otherItems[0]!.id;

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_inventory_consumptions" (
        "workspaceId", "restaurantOrderId", "restaurantOrderItemId", "productId", "warehouseId", "quantity", "unitCost"
      ) VALUES (${workspaceB}::uuid, ${order.id}::uuid, ${orderItemId}::uuid, ${productB}, NULL, 1, 999)
    `).rejects.toThrow("Restaurant inventory consumption order belongs to another workspace");

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_inventory_consumptions" (
        "workspaceId", "restaurantOrderId", "restaurantOrderItemId", "productId", "warehouseId", "quantity", "unitCost"
      ) VALUES (${workspaceA}::uuid, ${order.id}::uuid, ${orderItemId}::uuid, ${productB}, NULL, 1, 999)
    `).rejects.toThrow("Restaurant inventory consumption product belongs to another workspace");

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_inventory_consumptions" (
        "workspaceId", "restaurantOrderId", "restaurantOrderItemId", "productId", "warehouseId", "quantity", "unitCost"
      ) VALUES (${workspaceA}::uuid, ${order.id}::uuid, ${orderItemId}::uuid, ${productA}, ${warehouseB}::uuid, 1, 50)
    `).rejects.toThrow("Restaurant inventory consumption warehouse belongs to another workspace");

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_inventory_consumptions" (
        "workspaceId", "restaurantOrderId", "restaurantOrderItemId", "productId", "warehouseId", "quantity", "unitCost"
      ) VALUES (${workspaceA}::uuid, ${order.id}::uuid, ${otherOrderItemId}::uuid, ${productA}, NULL, 1, 50)
    `).rejects.toThrow("Restaurant inventory consumption item does not belong to the order");

    expect(await snapshots(order.id)).toEqual(before);

    const stockBeforeReturn = await db.product.findUniqueOrThrow({ where: { id: productA } });
    const returned = await createReturn(actor(), {
      orderId: order.id,
      reason: "Restock from tenant-bound historical snapshot",
      idempotencyKey: `return:${randomUUID()}`,
      items: [{ orderItemId, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });
    const returnRows = await db.$queryRaw<Array<{ inventoryCost: string }>>`
      SELECT "inventoryCost"::text AS "inventoryCost"
      FROM "restaurant_returns"
      WHERE "id"=${returned.id}::uuid
    `;
    expect(returnRows).toEqual([{ inventoryCost: "50.00" }]);
    expect((await db.product.findUniqueOrThrow({ where: { id: productA } })).stockQuantity.toString())
      .toBe(stockBeforeReturn.stockQuantity.plus(1).toString());

    const reversal = await reverseReturn(actor(), returned.id, "Return entered in error");
    expect(reversal.alreadyReversed).toBe(false);
    expect((await db.product.findUniqueOrThrow({ where: { id: productA } })).stockQuantity.toString())
      .toBe(stockBeforeReturn.stockQuantity.toString());
    expect(await snapshots(order.id)).toEqual(before);
  }, 60_000);
});
