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
let workspaceId = "";
let cashId = "";
let productId = "";
let menuItemId = "";
const actor = () => ({ workspaceId, userId, role: "OWNER" as const });

async function orderPostingSnapshot(orderId: string) {
  const rows = await db.$queryRaw<Array<{
    status: string;
    inventoryCost: string;
    inventoryPostedAt: Date | null;
    accountingPostedAt: Date | null;
    completedAt: Date | null;
  }>>`
    SELECT "status", "inventoryCost"::text AS "inventoryCost",
           "inventoryPostedAt", "accountingPostedAt", "completedAt"
    FROM "restaurant_orders"
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return rows[0]!;
}

describe("restaurant V1.38 completed posting snapshot", () => {
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
      data: { clerkId: `v138-${runId}`, email: `v138-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Completed posting snapshot ${runId}`,
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
      name: "V1.38 drawer",
      openingBalance: 1000,
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
        name: "V1.38 meal",
        sku: `V138-${runId}`,
        stockQuantity: 100,
        costPrice: 50,
        sellingPrice: 200,
      },
    });
    productId = product.id;
    const category = await createCategory(actor(), { name: `V1.38 ${runId}` });
    const item = await createMenuItem(actor(), {
      categoryId: category.id,
      productId,
      name: "V1.38 meal",
      price: 200,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    // Immutable financial fixtures live until the isolated test database is discarded.
    // Never delete their parents or disable history guards during teardown.
    if (db) await db.$disconnect();
  }, 60_000);

  it("freezes posting markers and inventory cost after completion without breaking returns", async () => {
    const order = await createOrder(actor(), {
      fulfillmentType: "TAKEAWAY",
      items: [{ menuItemId, quantity: 2 }],
    });
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

    const before = await orderPostingSnapshot(order.id);
    expect(before.status).toBe("COMPLETED");
    expect(before.inventoryCost).toBe("100.00");
    expect(before.inventoryPostedAt).not.toBeNull();
    expect(before.accountingPostedAt).not.toBeNull();
    expect(before.completedAt).not.toBeNull();

    const consumptionBefore = await db.$queryRaw<Array<{ quantity: string; unitCost: string }>>`
      SELECT "quantity"::text AS "quantity", "unitCost"::text AS "unitCost"
      FROM "restaurant_inventory_consumptions"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${order.id}::uuid
      ORDER BY "productId", "id"
    `;
    expect(consumptionBefore).toEqual([{ quantity: "2.0000", unitCost: "50.00" }]);
    const stockBeforeTamper = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const ledgerBeforeTamper = await db.generalLedgerEntry.count({ where: { workspaceId } });

    const attempts = [
      db.$executeRaw`UPDATE "restaurant_orders" SET "inventoryCost"="inventoryCost" + 1 WHERE "id"=${order.id}::uuid`,
      db.$executeRaw`UPDATE "restaurant_orders" SET "inventoryPostedAt"=NULL WHERE "id"=${order.id}::uuid`,
      db.$executeRaw`UPDATE "restaurant_orders" SET "inventoryPostedAt"="inventoryPostedAt" + interval '1 second' WHERE "id"=${order.id}::uuid`,
      db.$executeRaw`UPDATE "restaurant_orders" SET "accountingPostedAt"=NULL WHERE "id"=${order.id}::uuid`,
      db.$executeRaw`UPDATE "restaurant_orders" SET "accountingPostedAt"="accountingPostedAt" + interval '1 second' WHERE "id"=${order.id}::uuid`,
      db.$executeRaw`UPDATE "restaurant_orders" SET "completedAt"="completedAt" + interval '1 second' WHERE "id"=${order.id}::uuid`,
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toThrow("Restaurant completed posting snapshot is immutable");
      expect(await orderPostingSnapshot(order.id)).toEqual(before);
    }

    await expect(db.$executeRaw`
      UPDATE "restaurant_orders"
      SET "inventoryCost"="inventoryCost",
          "inventoryPostedAt"="inventoryPostedAt",
          "accountingPostedAt"="accountingPostedAt",
          "completedAt"="completedAt"
      WHERE "id"=${order.id}::uuid
    `).resolves.toBe(1);
    expect(await orderPostingSnapshot(order.id)).toEqual(before);
    expect(await db.$queryRaw<Array<{ quantity: string; unitCost: string }>>`
      SELECT "quantity"::text AS "quantity", "unitCost"::text AS "unitCost"
      FROM "restaurant_inventory_consumptions"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${order.id}::uuid
      ORDER BY "productId", "id"
    `).toEqual(consumptionBefore);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toString())
      .toBe(stockBeforeTamper.stockQuantity.toString());
    expect(await db.generalLedgerEntry.count({ where: { workspaceId } })).toBe(ledgerBeforeTamper);

    const itemRows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "restaurant_order_items"
      WHERE "restaurantOrderId"=${order.id}::uuid ORDER BY "createdAt", "id" LIMIT 1
    `;
    const stockBeforeReturn = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const returned = await createReturn(actor(), {
      orderId: order.id,
      reason: "Completed order return after posting snapshot lock",
      idempotencyKey: `return:${randomUUID()}`,
      items: [{ orderItemId: itemRows[0]!.id, quantity: 1, restock: true }],
      paymentAllocations: [{ paymentId: payment.id, amount: 200 }],
    });
    const returnRows = await db.$queryRaw<Array<{ inventoryCost: string }>>`
      SELECT "inventoryCost"::text AS "inventoryCost" FROM "restaurant_returns" WHERE "id"=${returned.id}::uuid
    `;
    expect(returnRows).toEqual([{ inventoryCost: "50.00" }]);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toString())
      .toBe(stockBeforeReturn.stockQuantity.plus(1).toString());

    const reversal = await reverseReturn(actor(), returned.id, "Return entered in error");
    expect(reversal.alreadyReversed).toBe(false);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toString())
      .toBe(stockBeforeReturn.stockQuantity.toString());
    expect(await orderPostingSnapshot(order.id)).toEqual(before);
  }, 60_000);
});
