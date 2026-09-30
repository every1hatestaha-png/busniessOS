import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];

const runId = randomUUID();
let ownerId = "";
let workspaceId = "";
let finishedProductId = "";
let ingredientProductId = "";
let firstMenuItemId = "";
let secondMenuItemId = "";
let recipeId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });

describe("restaurant V1.53 completion consumption conservation", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ transitionRestaurantOrderWithIntegrity: transition } = await import("@/lib/server/restaurant-integrity"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createOrder,
    } = await import("@/lib/server/restaurant-workspace"));

    const user = await db.user.create({
      data: { clerkId: `v153-owner-${runId}`, email: `v153-owner-${runId}@example.invalid` },
    });
    ownerId = user.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Completion conservation ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;

    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const [finishedProduct, ingredientProduct] = await Promise.all([
      db.product.create({
        data: {
          workspaceId,
          name: "V153 fractional recipe meal",
          sku: `V153-F-${runId}`,
          stockQuantity: 0,
          costPrice: 0,
          sellingPrice: 500,
        },
      }),
      db.product.create({
        data: {
          workspaceId,
          name: "V153 fractional ingredient",
          sku: `V153-I-${runId}`,
          stockQuantity: 1,
          costPrice: 100,
          sellingPrice: 100,
        },
      }),
    ]);
    finishedProductId = finishedProduct.id;
    ingredientProductId = ingredientProduct.id;

    const recipeRows = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "recipes" ("workspaceId", "finishedProductId", "yieldQuantity", "isActive")
      VALUES (${workspaceId}::uuid, ${finishedProductId}::uuid, 1.0000, true)
      RETURNING "id"::text AS "id"
    `;
    recipeId = recipeRows[0]!.id;

    await db.$executeRaw`
      INSERT INTO "recipe_items" ("recipeId", "ingredientProductId", "quantity", "wastagePercent")
      VALUES (${recipeId}::uuid, ${ingredientProductId}::uuid, 0.0001, 0)
    `;

    const category = await createCategory(owner(), { name: `V153 ${runId}` });
    const firstMenuItem = await createMenuItem(owner(), {
      categoryId: category.id,
      productId: finishedProductId,
      name: "V153 fractional meal A",
      price: 500,
    });
    const secondMenuItem = await createMenuItem(owner(), {
      categoryId: category.id,
      productId: finishedProductId,
      name: "V153 fractional meal B",
      price: 500,
    });
    firstMenuItemId = firstMenuItem.id;
    secondMenuItemId = secondMenuItem.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "restaurant_refunds" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_payments" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_inventory_consumptions" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_items" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_menu_categories" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "recipe_items" WHERE "recipeId"=${recipeId}::uuid`;
    await db.$executeRaw`DELETE FROM "recipes" WHERE "id"=${recipeId}::uuid`;
    await db.product.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: ownerId } });
    await db.$disconnect();
  }, 60_000);

  it("keeps persisted stock movement equal to the immutable per-item consumption snapshot total", async () => {
    const order = await createOrder(owner(), {
      fulfillmentType: "TAKEAWAY",
      items: [
        { menuItemId: firstMenuItemId, quantity: 0.6 },
        { menuItemId: secondMenuItemId, quantity: 0.6 },
      ],
    });
    await transition(owner(), order.id, "PREPARING");
    await transition(owner(), order.id, "READY");

    const before = await db.product.findUniqueOrThrow({ where: { id: ingredientProductId } });
    expect(before.stockQuantity.toFixed(4)).toBe("1.0000");

    const completed = await transition(owner(), order.id, "COMPLETED");
    expect(completed.status).toBe("COMPLETED");

    const [after, consumptions, inventoryTransactions, orderRows] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: ingredientProductId } }),
      db.$queryRaw<Array<{ restaurantOrderItemId: string; quantity: string }>>`
        SELECT "restaurantOrderItemId"::text AS "restaurantOrderItemId", "quantity"::text AS "quantity"
        FROM "restaurant_inventory_consumptions"
        WHERE "workspaceId"=${workspaceId}::uuid
          AND "restaurantOrderId"=${order.id}::uuid
          AND "productId"=${ingredientProductId}
        ORDER BY "restaurantOrderItemId"
      `,
      db.inventoryTransaction.findMany({
        where: { workspaceId, productId: ingredientProductId, reference: `RESTAURANT:${order.id}` },
        orderBy: { id: "asc" },
      }),
      db.$queryRaw<Array<{ inventoryCost: string; inventoryPostedAt: Date | null }>>`
        SELECT "inventoryCost"::text AS "inventoryCost", "inventoryPostedAt"
        FROM "restaurant_orders"
        WHERE "workspaceId"=${workspaceId}::uuid AND "id"=${order.id}::uuid
      `,
    ]);

    // Each line has a raw recipe requirement of 0.00006. The stock column stores
    // one aggregate 4dp movement: ROUND(0.00006 + 0.00006, 4) = 0.0001.
    expect(after.stockQuantity.toFixed(4)).toBe("0.9999");
    expect(before.stockQuantity.minus(after.stockQuantity).toFixed(4)).toBe("0.0001");

    // Historical snapshots must conserve that exact movement. Independent line
    // rounding would incorrectly snapshot 0.0002 and a full return could create stock.
    const snapshotTotal = consumptions.reduce((sum, row) => sum + Number(row.quantity), 0);
    expect(snapshotTotal.toFixed(4)).toBe("0.0001");
    expect(consumptions.every((row) => Number(row.quantity) > 0)).toBe(true);

    expect(inventoryTransactions).toHaveLength(1);
    expect(inventoryTransactions[0]!.quantityChanged.toFixed(4)).toBe("-0.0001");
    expect(orderRows[0]!.inventoryPostedAt).not.toBeNull();
    expect(orderRows[0]!.inventoryCost).toBe("0.01");
  }, 120_000);
});
