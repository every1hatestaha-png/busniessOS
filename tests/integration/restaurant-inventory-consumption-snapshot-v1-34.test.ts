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
let menuItemId = "";
const actor = (workspaceId = workspaceA) => ({ workspaceId, userId, role: "OWNER" as const });

async function consumptionSnapshot(orderId: string) {
  return db.$queryRaw<Array<Record<string, unknown>>>`
    SELECT "id"::text, "workspaceId"::text, "restaurantOrderId"::text,
           "restaurantOrderItemId"::text, "productId", "warehouseId"::text,
           "quantity"::text, "unitCost"::text, "createdAt"::text
    FROM "restaurant_inventory_consumptions"
    WHERE "workspaceId"=${workspaceA}::uuid AND "restaurantOrderId"=${orderId}::uuid
    ORDER BY "productId", "id"
  `;
}

describe("restaurant V1.34 immutable inventory consumption snapshots", () => {
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

    const user = await db.user.create({ data: { clerkId: `v134-${runId}`, email: `v134-${runId}@example.invalid` } });
    userId = user.id;
    const [a, b] = await Promise.all([
      db.workspace.create({ data: { name: `Inventory snapshot A ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `Inventory snapshot B ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "OWNER" } } } }),
    ]);
    workspaceA = a.id;
    workspaceB = b.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceA}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const cash = await createCashBankAccount(actor(), {
      name: "V1.34 drawer", openingBalance: 1000, isBank: false,
      bankName: "", accountTitle: "", accountNumber: "", notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceA)).find((row) => row.id === cash.id)!.cashBankAccountId;

    const [aProduct, bProduct] = await Promise.all([
      db.product.create({ data: { workspaceId: workspaceA, name: "V1.34 meal", sku: `V134-A-${runId}`, stockQuantity: 100, costPrice: 50, sellingPrice: 200 } }),
      db.product.create({ data: { workspaceId: workspaceB, name: "Foreign product", sku: `V134-B-${runId}`, stockQuantity: 100, costPrice: 999, sellingPrice: 999 } }),
    ]);
    productA = aProduct.id;
    productB = bProduct.id;
    const category = await createCategory(actor(), { name: `V1.34 ${runId}` });
    const menuItem = await createMenuItem(actor(), { categoryId: category.id, productId: productA, name: "V1.34 meal", price: 200 });
    menuItemId = menuItem.id;
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

  it("rejects historical consumption rewrites and preserves exact restock/reversal basis", async () => {
    const order = await createOrder(actor(), { fulfillmentType: "TAKEAWAY", items: [{ menuItemId, quantity: 2 }] });
    const payment = await collect(actor(), {
      orderId: order.id, cashBankAccountId: cashId, method: "CASH", amount: 400,
      idempotencyKey: `pay:${randomUUID()}`,
    });
    for (const status of ["PREPARING", "READY", "COMPLETED"] as const) await transition(actor(), order.id, status);

    const snapshots = await consumptionSnapshot(order.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ productId: productA, quantity: "2.0000", unitCost: "50.00" });
    const consumptionId = String(snapshots[0]!.id);

    const attempts = [
      () => db.$executeRaw`UPDATE "restaurant_inventory_consumptions" SET "unitCost"=999 WHERE "id"=${consumptionId}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_inventory_consumptions" SET "quantity"="quantity" + 1 WHERE "id"=${consumptionId}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_inventory_consumptions" SET "productId"=${productB} WHERE "id"=${consumptionId}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_inventory_consumptions" SET "workspaceId"=${workspaceB}::uuid WHERE "id"=${consumptionId}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_inventory_consumptions" SET "restaurantOrderId"=${randomUUID()}::uuid WHERE "id"=${consumptionId}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_inventory_consumptions" SET "restaurantOrderItemId"=${randomUUID()}::uuid WHERE "id"=${consumptionId}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_inventory_consumptions" SET "warehouseId"=${randomUUID()}::uuid WHERE "id"=${consumptionId}::uuid`,
      () => db.$executeRaw`UPDATE "restaurant_inventory_consumptions" SET "createdAt"="createdAt" + interval '1 second' WHERE "id"=${consumptionId}::uuid`,
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toThrow("Restaurant inventory consumption snapshot is immutable");
      expect(await consumptionSnapshot(order.id)).toEqual(snapshots);
    }
    await expect(
      db.$executeRaw`UPDATE "restaurant_inventory_consumptions" SET "unitCost"="unitCost" WHERE "id"=${consumptionId}::uuid`,
    ).resolves.toBe(1);

    const orderItems = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items"
      WHERE "restaurantOrderId"=${order.id}::uuid ORDER BY "createdAt", "id" LIMIT 1
    `;
    const stockBeforeReturn = await db.product.findUniqueOrThrow({ where: { id: productA } });
    const returned = await createReturn(actor(), {
      orderId: order.id,
      reason: "Restock from historical snapshot",
      idempotencyKey: `return:${randomUUID()}`,
      items: [{ orderItemId: orderItems[0]!.id, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });
    const returnRows = await db.$queryRaw<Array<{ inventoryCost: string }>>`
      SELECT "inventoryCost"::text AS "inventoryCost" FROM "restaurant_returns" WHERE "id"=${returned.id}::uuid
    `;
    expect(returnRows).toEqual([{ inventoryCost: "50.00" }]);
    expect((await db.product.findUniqueOrThrow({ where: { id: productA } })).stockQuantity.toString())
      .toBe(stockBeforeReturn.stockQuantity.plus(1).toString());

    const reversed = await reverseReturn(actor(), returned.id, "Return was entered in error");
    expect(reversed.alreadyReversed).toBe(false);
    expect((await db.product.findUniqueOrThrow({ where: { id: productA } })).stockQuantity.toString())
      .toBe(stockBeforeReturn.stockQuantity.toString());
    expect(await consumptionSnapshot(order.id)).toEqual(snapshots);
  }, 60_000);
});
