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
let extraProductId = "";
let menuItemId = "";
const actor = () => ({ workspaceId, userId, role: "OWNER" as const });

async function snapshots(orderId: string) {
  return db.$queryRaw<Array<{
    id: string;
    restaurantOrderItemId: string;
    productId: string;
    quantity: string;
    unitCost: string;
  }>>`
    SELECT "id"::text AS "id", "restaurantOrderItemId"::text AS "restaurantOrderItemId",
           "productId", "quantity"::text AS "quantity", "unitCost"::text AS "unitCost"
    FROM "restaurant_inventory_consumptions"
    WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid
    ORDER BY "productId", "id"
  `;
}

describe("restaurant V1.37 inventory consumption insert origin", () => {
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
      data: { clerkId: `v137-${runId}`, email: `v137-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Consumption origin ${runId}`,
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
      name: "V1.37 drawer",
      openingBalance: 1000,
      isBank: false,
      bankName: "",
      accountTitle: "",
      accountNumber: "",
      notes: "",
    });
    cashId = (await getCashBankAccounts(workspaceId)).find((row) => row.id === cash.id)!.cashBankAccountId;
    const { openRestaurantCashShiftSafely } = await import("@/lib/server/restaurant-cash-shifts");
    await openRestaurantCashShiftSafely(actor(), 0, "V1.84 consumption origin shift");

    const [primary, extra] = await Promise.all([
      db.product.create({
        data: {
          workspaceId,
          name: "V1.37 meal",
          sku: `V137-A-${runId}`,
          stockQuantity: 100,
          costPrice: 50,
          sellingPrice: 200,
        },
      }),
      db.product.create({
        data: {
          workspaceId,
          name: "V1.37 forged ingredient",
          sku: `V137-B-${runId}`,
          stockQuantity: 100,
          costPrice: 75,
          sellingPrice: 100,
        },
      }),
    ]);
    productId = primary.id;
    extraProductId = extra.id;
    const category = await createCategory(actor(), { name: `V1.37 ${runId}` });
    const item = await createMenuItem(actor(), {
      categoryId: category.id,
      productId,
      name: "V1.37 meal",
      price: 200,
    });
    menuItemId = item.id;
  }, 60_000);

  afterAll(async () => {
    // Immutable financial fixtures live until the isolated test database is discarded.
    // Never delete their parents or disable history guards during teardown.
    if (db) await db.$disconnect();
  }, 60_000);

  it("allows only completion-trigger snapshots and blocks same-tenant forged consumption rows", async () => {
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

    const before = await snapshots(order.id);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ productId, quantity: "2.0000", unitCost: "50.00" });
    const orderItemId = before[0]!.restaurantOrderItemId;

    await expect(db.$executeRaw`
      INSERT INTO "restaurant_inventory_consumptions" (
        "workspaceId", "restaurantOrderId", "restaurantOrderItemId", "productId", "warehouseId", "quantity", "unitCost"
      ) VALUES (
        ${workspaceId}::uuid, ${order.id}::uuid, ${orderItemId}::uuid,
        ${extraProductId}, NULL, 7, 75
      )
    `).rejects.toThrow("Restaurant inventory consumption snapshots can only be created by order completion");

    expect(await snapshots(order.id)).toEqual(before);

    const extraStockBefore = await db.product.findUniqueOrThrow({ where: { id: extraProductId } });
    const primaryStockBefore = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const returned = await createReturn(actor(), {
      orderId: order.id,
      reason: "Restock from authentic completion snapshot",
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
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toString())
      .toBe(primaryStockBefore.stockQuantity.plus(1).toString());
    expect((await db.product.findUniqueOrThrow({ where: { id: extraProductId } })).stockQuantity.toString())
      .toBe(extraStockBefore.stockQuantity.toString());

    const reversal = await reverseReturn(actor(), returned.id, "Return entered in error");
    expect(reversal.alreadyReversed).toBe(false);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity.toString())
      .toBe(primaryStockBefore.stockQuantity.toString());
    expect((await db.product.findUniqueOrThrow({ where: { id: extraProductId } })).stockQuantity.toString())
      .toBe(extraStockBefore.stockQuantity.toString());
    expect(await snapshots(order.id)).toEqual(before);
  }, 60_000);
});
