import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let transition: typeof import("@/lib/server/restaurant-integrity")["transitionRestaurantOrderWithIntegrity"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];

async function fixture(stock: number, warehouseStock = stock) {
  const id = randomUUID();
  const user = await db.user.create({ data: { clerkId: `v156-${id}`, email: `v156-${id}@example.invalid` } });
  const workspace = await db.workspace.create({ data: {
    name: `V156 ${id}`, vertical: "LEGACY", members: { create: { userId: user.id, role: "OWNER" } },
  } });
  const workspaceId = workspace.id;
  const context = { workspaceId, userId: user.id, role: "OWNER" as const };
  await db.$executeRaw`INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config") VALUES
    (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb),
    (${workspaceId}::uuid, 'inventory', true, '{"warehouseStockMode":"MANAGED"}'::jsonb)`;
  const warehouseId = randomUUID();
  const otherWarehouseId = randomUUID();
  await db.$executeRaw`INSERT INTO "warehouses" ("id", "workspaceId", "name", "code", "isDefault") VALUES
    (${warehouseId}::uuid, ${workspaceId}::uuid, 'Default', 'DEFAULT', true),
    (${otherWarehouseId}::uuid, ${workspaceId}::uuid, 'Other', 'OTHER', false)`;
  const finished = await db.product.create({ data: { workspaceId, name: `Meal ${id}` } });
  const ingredient = await db.product.create({ data: { workspaceId, name: `Ingredient ${id}`, stockQuantity: stock, costPrice: 10 } });
  await db.$executeRaw`INSERT INTO "warehouse_stocks" ("workspaceId", "warehouseId", "productId", "quantity") VALUES
    (${workspaceId}::uuid, ${warehouseId}::uuid, ${ingredient.id}::uuid, ${warehouseStock}),
    (${workspaceId}::uuid, ${otherWarehouseId}::uuid, ${ingredient.id}::uuid, ${new Prisma.Decimal(stock).minus(warehouseStock)})`;
  const recipeId = randomUUID();
  await db.$executeRaw`INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
    VALUES (${recipeId}::uuid, ${workspaceId}::uuid, ${finished.id}::uuid, 2)`;
  await db.$executeRaw`INSERT INTO "recipe_items" ("recipeId", "ingredientProductId", "quantity", "wastagePercent")
    VALUES (${recipeId}::uuid, ${ingredient.id}::uuid, 0.5, 20)`;
  const category = await createCategory(context, { name: `Menu ${id}` });
  const menu = await createMenuItem(context, { categoryId: category.id, productId: finished.id, name: `Meal ${id}`, price: 100 });
  const ready = async () => {
    const order = await createOrder(context, { fulfillmentType: "TAKEAWAY", items: [{ menuItemId: menu.id, quantity: 1 }] });
    await transition(context, order.id, "PREPARING");
    await transition(context, order.id, "READY");
    return order.id;
  };
  return { context, workspaceId, productId: ingredient.id, warehouseId, otherWarehouseId, ready };
}

async function stockState(f: Awaited<ReturnType<typeof fixture>>) {
  const product = await db.product.findUniqueOrThrow({ where: { id: f.productId } });
  const rows = await db.$queryRaw<Array<{ id: string; quantity: Prisma.Decimal }>>`
    SELECT "warehouseId"::text AS "id", "quantity" FROM "warehouse_stocks"
    WHERE "workspaceId"=${f.workspaceId}::uuid AND "productId"=${f.productId}::uuid`;
  return {
    product: product.stockQuantity.toFixed(4),
    warehouse: rows.find(r => r.id === f.warehouseId)!.quantity.toFixed(4),
    other: rows.find(r => r.id === f.otherWarehouseId)!.quantity.toFixed(4),
  };
}

async function effects(workspaceId: string, orderId: string) {
  const orders = await db.$queryRaw<Array<{ status: string; inventoryPostedAt: Date | null; accountingPostedAt: Date | null }>>`
    SELECT "status", "inventoryPostedAt", "accountingPostedAt" FROM "restaurant_orders" WHERE "id"=${orderId}::uuid`;
  const snapshots = await db.$queryRaw<Array<{ quantity: Prisma.Decimal; warehouseId: string }>>`
    SELECT "quantity", "warehouseId"::text AS "warehouseId" FROM "restaurant_inventory_consumptions"
    WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid`;
  const movements = await db.inventoryTransaction.findMany({ where: { workspaceId, reference: `RESTAURANT:${orderId}` } });
  const ledger = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "SALE", sourceId: orderId } });
  return { order: orders[0]!, snapshots, movements, ledger };
}

// Hold stock until both independent service calls are waiting on PostgreSQL row locks.
// This proves actual overlap, rather than relying on Promise.all scheduling alone.
async function race(f: Awaited<ReturnType<typeof fixture>>, orderIds: string[]) {
  let unlock!: () => void;
  let locked!: () => void;
  const release = new Promise<void>(resolve => { unlock = resolve; });
  const acquired = new Promise<void>(resolve => { locked = resolve; });
  const blocker = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "products" WHERE "id"=${f.productId} FOR UPDATE`;
    locked();
    await release;
  }, { timeout: 20_000 });
  await acquired;
  const results = Promise.allSettled(orderIds.map(id => transition(f.context, id, "COMPLETED")));
  try {
    let waiting = 0;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && waiting < 2) {
      const rows = await db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count" FROM pg_stat_activity
        WHERE datname=current_database() AND pid<>pg_backend_pid()
          AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'`;
      waiting = rows[0]!.count;
      if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(waiting).toBeGreaterThanOrEqual(2);
  } finally {
    unlock();
    await blocker;
  }
  return results;
}

describe("restaurant V1.56 managed recipe stock concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ transitionRestaurantOrderWithIntegrity: transition } = await import("@/lib/server/restaurant-integrity"));
    ({ createRestaurantMenuCategory: createCategory, createRestaurantMenuItem: createMenuItem, createPosRestaurantOrder: createOrder } = await import("@/lib/server/restaurant-workspace"));
  });
  afterAll(async () => { if (db) await db.$disconnect(); });

  it("serializes competing orders without overselling fractional recipe stock", async () => {
    const f = await fixture(0.5);
    const ids = [await f.ready(), await f.ready()];
    expect(await stockState(f)).toEqual({ product: "0.5000", warehouse: "0.5000", other: "0.0000" });
    const results = await race(f, ids);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const loser = results.findIndex(r => r.status === "rejected");
    expect((results[loser] as PromiseRejectedResult).reason).toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await stockState(f)).toEqual({ product: "0.2000", warehouse: "0.2000", other: "0.0000" });
    const rejected = await effects(f.workspaceId, ids[loser]!);
    expect(rejected.order).toEqual({ status: "READY", inventoryPostedAt: null, accountingPostedAt: null });
    expect(rejected.snapshots).toHaveLength(0);
    expect(rejected.movements).toHaveLength(0);
    expect(rejected.ledger).toHaveLength(0);
    const winner = await effects(f.workspaceId, ids[1 - loser]!);
    expect(winner.snapshots).toHaveLength(1);
    expect(winner.snapshots[0]!.quantity.toFixed(4)).toBe("0.3000");
    expect(winner.snapshots[0]!.warehouseId).toBe(f.warehouseId);
    expect(winner.movements).toHaveLength(1);
    expect(winner.movements[0]!.quantityChanged.toFixed(4)).toBe("-0.3000");
    expect(winner.ledger.length).toBeGreaterThan(0);
    expect(winner.ledger.reduce((sum, row) => sum.plus(row.debit).minus(row.credit), new Prisma.Decimal(0)).isZero()).toBe(true);
  }, 60_000);

  it("posts one exact stock and accounting effect for overlapping completion retries", async () => {
    const f = await fixture(1);
    const id = await f.ready();
    const results = await race(f, [id, id]);
    expect(results.every(r => r.status === "fulfilled")).toBe(true);
    const before = await effects(f.workspaceId, id);
    expect(before.snapshots).toHaveLength(1);
    expect(before.movements).toHaveLength(1);
    expect(before.ledger.length).toBeGreaterThan(0);
    expect(await stockState(f)).toEqual({ product: "0.7000", warehouse: "0.7000", other: "0.0000" });
    await transition(f.context, id, "COMPLETED");
    expect(await effects(f.workspaceId, id)).toEqual(before);
    expect(await stockState(f)).toEqual({ product: "0.7000", warehouse: "0.7000", other: "0.0000" });
  }, 60_000);

  it("rolls back core stock and all posting when the selected warehouse is short", async () => {
    const f = await fixture(1, 0.2);
    const id = await f.ready();
    await expect(transition(f.context, id, "COMPLETED")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await stockState(f)).toEqual({ product: "1.0000", warehouse: "0.2000", other: "0.8000" });
    const state = await effects(f.workspaceId, id);
    expect(state.order).toEqual({ status: "READY", inventoryPostedAt: null, accountingPostedAt: null });
    expect(state.snapshots).toHaveLength(0);
    expect(state.movements).toHaveLength(0);
    expect(state.ledger).toHaveLength(0);
  });
});
