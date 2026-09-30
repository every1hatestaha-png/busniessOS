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
let menuItemId = "";
let productId = "";

const owner = () => ({ workspaceId, userId: ownerId, role: "OWNER" as const });

async function freshReadyOrder() {
  const order = await createOrder(owner(), {
    fulfillmentType: "TAKEAWAY",
    items: [{ menuItemId, quantity: 1 }],
  });
  await transition(owner(), order.id, "PREPARING");
  await transition(owner(), order.id, "READY");
  return order;
}

async function snapshot(orderId: string) {
  const [orderRows, product, consumptions, inventoryTransactions, ledger] = await Promise.all([
    db.$queryRaw<Array<{
      status: string;
      inventoryPostedAt: Date | null;
      accountingPostedAt: Date | null;
      inventoryCost: string | null;
    }>>`
      SELECT "status", "inventoryPostedAt", "accountingPostedAt", "inventoryCost"::text
      FROM "restaurant_orders"
      WHERE "workspaceId"=${workspaceId}::uuid AND "id"=${orderId}::uuid
    `,
    db.product.findUniqueOrThrow({ where: { id: productId } }),
    db.$queryRaw<Array<{ id: string; quantity: string }>>`
      SELECT "id"::text, "quantity"::text
      FROM "restaurant_inventory_consumptions"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid
      ORDER BY "id"
    `,
    db.inventoryTransaction.findMany({
      where: { workspaceId, reference: `RESTAURANT:${orderId}` },
      orderBy: { id: "asc" },
    }),
    db.generalLedgerEntry.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
  ]);

  return {
    order: orderRows[0]!,
    product,
    consumptions,
    inventoryTransactions,
    ledger,
  };
}

describe("restaurant V1.51 completion exactly-once concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ transitionRestaurantOrderWithIntegrity: transition } = await import("@/lib/server/restaurant-integrity"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createOrder,
    } = await import("@/lib/server/restaurant-workspace"));

    const user = await db.user.create({
      data: { clerkId: `v151-owner-${runId}`, email: `v151-owner-${runId}@example.invalid` },
    });
    ownerId = user.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Completion exactly once ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;

    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const product = await db.product.create({
      data: {
        workspaceId,
        name: "V151 completion meal",
        sku: `V151-${runId}`,
        stockQuantity: 100,
        costPrice: 100,
        sellingPrice: 500,
      },
    });
    productId = product.id;

    const category = await createCategory(owner(), { name: `V151 ${runId}` });
    const menuItem = await createMenuItem(owner(), {
      categoryId: category.id,
      productId,
      name: "V151 completion meal",
      price: 500,
    });
    menuItemId = menuItem.id;
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
    await db.product.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: ownerId } });
    await db.$disconnect();
  }, 60_000);

  it("posts inventory and accounting exactly once when two callers complete the same READY order", async () => {
    const controlOrder = await freshReadyOrder();
    const controlBefore = await snapshot(controlOrder.id);
    const controlLedgerBefore = controlBefore.ledger.length;
    const controlStockBefore = controlBefore.product.stockQuantity;

    const controlResult = await transition(owner(), controlOrder.id, "COMPLETED");
    expect(controlResult.status).toBe("COMPLETED");

    const controlAfter = await snapshot(controlOrder.id);
    const controlLedgerDelta = controlAfter.ledger.length - controlLedgerBefore;
    expect(controlAfter.product.stockQuantity.toString()).toBe(controlStockBefore.minus(1).toString());
    expect(controlAfter.consumptions).toHaveLength(1);
    expect(controlAfter.inventoryTransactions).toHaveLength(1);
    expect(controlAfter.order.inventoryPostedAt).not.toBeNull();
    expect(controlAfter.order.accountingPostedAt).not.toBeNull();
    expect(controlLedgerDelta).toBeGreaterThan(0);

    const racedOrder = await freshReadyOrder();
    const racedBefore = await snapshot(racedOrder.id);
    const racedLedgerBefore = racedBefore.ledger.length;
    const racedStockBefore = racedBefore.product.stockQuantity;

    const results = await Promise.allSettled([
      transition(owner(), racedOrder.id, "COMPLETED"),
      transition(owner(), racedOrder.id, "COMPLETED"),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    for (const result of results) {
      if (result.status === "fulfilled") expect(result.value.status).toBe("COMPLETED");
    }

    const racedAfter = await snapshot(racedOrder.id);
    const racedLedgerDelta = racedAfter.ledger.length - racedLedgerBefore;

    expect(racedAfter.order.status).toBe("COMPLETED");
    expect(racedAfter.order.inventoryPostedAt).not.toBeNull();
    expect(racedAfter.order.accountingPostedAt).not.toBeNull();
    expect(racedAfter.product.stockQuantity.toString()).toBe(racedStockBefore.minus(1).toString());
    expect(racedAfter.consumptions).toHaveLength(1);
    expect(racedAfter.inventoryTransactions).toHaveLength(1);
    expect(racedLedgerDelta).toBe(controlLedgerDelta);

    const retry = await transition(owner(), racedOrder.id, "COMPLETED");
    expect(retry.status).toBe("COMPLETED");

    const afterRetry = await snapshot(racedOrder.id);
    expect(afterRetry.product.stockQuantity.toString()).toBe(racedAfter.product.stockQuantity.toString());
    expect(afterRetry.consumptions).toEqual(racedAfter.consumptions);
    expect(afterRetry.inventoryTransactions).toEqual(racedAfter.inventoryTransactions);
    expect(afterRetry.ledger).toEqual(racedAfter.ledger);
  }, 120_000);
});
