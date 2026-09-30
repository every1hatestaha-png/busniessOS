import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createCategory: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuCategory"];
let createMenuItem: typeof import("@/lib/server/restaurant-workspace")["createRestaurantMenuItem"];
let createOrder: typeof import("@/lib/server/restaurant-workspace")["createPosRestaurantOrder"];

async function fixture() {
  const id = randomUUID();
  const user = await db.user.create({ data: { clerkId: `v165-${id}`, email: `v165-${id}@example.invalid` } });
  const [workspace, otherWorkspace] = await Promise.all([
    db.workspace.create({
      data: { name: `V165 ${id}`, vertical: "LEGACY", members: { create: { userId: user.id, role: "OWNER" } } },
    }),
    db.workspace.create({ data: { name: `V165 other ${id}`, vertical: "LEGACY" } }),
  ]);
  const workspaceId = workspace.id;
  const context = { workspaceId, userId: user.id, role: "OWNER" as const };
  await db.$executeRaw`INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config")
    VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb)`;

  const warehouseId = randomUUID();
  await db.$executeRaw`INSERT INTO "warehouses" ("id", "workspaceId", "name", "code", "isDefault", "isActive")
    VALUES (${warehouseId}::uuid, ${workspaceId}::uuid, 'V165 Default', ${`V165-${id.slice(0, 8)}`}, true, true)`;

  const product = await db.product.create({
    data: { workspaceId, name: `V165 product ${id}`, stockQuantity: 5, costPrice: 10, sellingPrice: 100 },
  });
  const category = await createCategory(context, { name: `V165 Menu ${id}` });
  const menu = await createMenuItem(context, {
    categoryId: category.id,
    productId: product.id,
    name: `V165 item ${id}`,
    price: 100,
  });
  const order = await createOrder(context, {
    fulfillmentType: "TAKEAWAY",
    items: [{ menuItemId: menu.id, quantity: 1 }],
  });

  return { workspaceId, otherWorkspaceId: otherWorkspace.id, warehouseId, orderId: order.id };
}

async function snapshot(orderId: string) {
  return db.$executeRaw`UPDATE "restaurant_orders" SET "inventoryPostedAt"=now() WHERE "id"=${orderId}::uuid`;
}

async function waitForLockWait() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM pg_stat_activity
      WHERE datname=current_database()
        AND pid<>pg_backend_pid()
        AND wait_event_type='Lock'`;
    if (rows[0]!.count > 0) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Expected a PostgreSQL lock wait");
}

function controlledHold() {
  let release!: () => void;
  let ready!: () => void;
  return {
    hold: new Promise<void>(resolve => { release = resolve; }),
    signal: new Promise<void>(resolve => { ready = resolve; }),
    release: () => release(),
    ready: () => ready(),
  };
}

describe("restaurant V1.65 Warehouse reference concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({
      createRestaurantMenuCategory: createCategory,
      createRestaurantMenuItem: createMenuItem,
      createPosRestaurantOrder: createOrder,
    } = await import("@/lib/server/restaurant-workspace"));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("lets the first consumption snapshot commit and then rejects a concurrent Warehouse move", async () => {
    const f = await fixture();
    const gate = controlledHold();

    const child = db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "restaurant_orders" SET "inventoryPostedAt"=now() WHERE "id"=${f.orderId}::uuid`;
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const parentMove = (async () => db.$executeRaw`
      UPDATE "warehouses" SET "workspaceId"=${f.otherWorkspaceId}::uuid WHERE "id"=${f.warehouseId}::uuid
    `)();
    void parentMove.catch(() => {});
    await waitForLockWait();
    gate.release();
    await child;

    await expect(parentMove).rejects.toThrow("Restaurant-linked warehouse identity and workspace are immutable");
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_inventory_consumptions"
      WHERE "restaurantOrderId"=${f.orderId}::uuid AND "warehouseId"=${f.warehouseId}::uuid`;
    expect(rows[0]!.count).toBe(1);
  }, 30_000);

  it("rejects a stale consumption snapshot after a concurrent Warehouse move commits first", async () => {
    const f = await fixture();
    const gate = controlledHold();

    const parent = db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "warehouses" SET "workspaceId"=${f.otherWorkspaceId}::uuid WHERE "id"=${f.warehouseId}::uuid`;
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const child = (async () => snapshot(f.orderId))();
    void child.catch(() => {});
    await waitForLockWait();
    gate.release();
    await parent;

    await expect(child).rejects.toThrow("Restaurant inventory consumption warehouse belongs to another workspace");
    const order = await db.$queryRaw<Array<{ inventoryPostedAt: Date | null }>>`
      SELECT "inventoryPostedAt" FROM "restaurant_orders" WHERE "id"=${f.orderId}::uuid`;
    expect(order[0]!.inventoryPostedAt).toBeNull();
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_inventory_consumptions"
      WHERE "restaurantOrderId"=${f.orderId}::uuid`;
    expect(rows[0]!.count).toBe(0);
  }, 30_000);
});
