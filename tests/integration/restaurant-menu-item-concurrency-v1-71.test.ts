import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
type RawExecutor = Pick<typeof db, "$executeRaw">;

async function fixture() {
  const id = randomUUID();
  const [workspaceA, workspaceB] = await Promise.all([
    db.workspace.create({ data: { name: `V171 A ${id}`, vertical: "LEGACY" } }),
    db.workspace.create({ data: { name: `V171 B ${id}`, vertical: "LEGACY" } }),
  ]);

  const categoryA = randomUUID();
  const categoryB = randomUUID();
  const menuItemId = randomUUID();
  const orderId = randomUUID();

  await db.$executeRaw`INSERT INTO "restaurant_menu_categories" (
    "id", "workspaceId", "name", "sortOrder", "isActive"
  ) VALUES
    (${categoryA}::uuid, ${workspaceA.id}::uuid, ${`V171 A ${id}`}, 1, true),
    (${categoryB}::uuid, ${workspaceB.id}::uuid, ${`V171 B ${id}`}, 1, true)`;

  await db.$executeRaw`INSERT INTO "restaurant_menu_items" (
    "id", "workspaceId", "categoryId", "name", "price", "sortOrder", "isActive", "isAvailable"
  ) VALUES (
    ${menuItemId}::uuid, ${workspaceA.id}::uuid, ${categoryA}::uuid,
    ${`V171 Item ${id}`}, 50, 1, true, true
  )`;

  await db.$executeRaw`INSERT INTO "restaurant_orders" (
    "id", "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus",
    "subtotal", "discountAmount", "taxAmount", "total"
  ) VALUES (
    ${orderId}::uuid, ${workspaceA.id}::uuid, ${`V171-${id}`}, 'WHATSAPP', 'TAKEAWAY',
    'PENDING_REVIEW', 'UNPAID', 50, 0, 0, 50
  )`;

  return {
    workspaceA: workspaceA.id,
    workspaceB: workspaceB.id,
    categoryA,
    categoryB,
    menuItemId,
    orderId,
  };
}

async function insertOrderItem(tx: RawExecutor, f: Awaited<ReturnType<typeof fixture>>) {
  const orderItemId = randomUUID();
  await tx.$executeRaw`INSERT INTO "restaurant_order_items" (
    "id", "restaurantOrderId", "menuItemId", "itemName", "quantity", "unitPrice", "lineTotal"
  ) VALUES (
    ${orderItemId}::uuid, ${f.orderId}::uuid, ${f.menuItemId}::uuid,
    ${`V171 Order Item ${orderItemId}`}, 1, 50, 50
  )`;
  return orderItemId;
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

describe("restaurant V1.71 menu item reference concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("lets the first order-item reference commit before rejecting a concurrent menu-item move", async () => {
    const f = await fixture();
    const gate = controlledHold();

    const child = db.$transaction(async tx => {
      await insertOrderItem(tx, f);
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const parentMove = (async () => db.$executeRaw`
      UPDATE "restaurant_menu_items"
      SET "workspaceId"=${f.workspaceB}::uuid, "categoryId"=${f.categoryB}::uuid
      WHERE "id"=${f.menuItemId}::uuid
    `)();
    void parentMove.catch(() => {});

    await waitForLockWait();
    gate.release();
    await child;

    await expect(parentMove).rejects.toThrow(
      "Restaurant-linked menu item identity, tenant, category and product mapping are immutable",
    );
  }, 30_000);

  it("revalidates a stale order-item reference after a concurrent menu-item move commits first", async () => {
    const f = await fixture();
    const gate = controlledHold();

    const parent = db.$transaction(async tx => {
      await tx.$executeRaw`
        UPDATE "restaurant_menu_items"
        SET "workspaceId"=${f.workspaceB}::uuid, "categoryId"=${f.categoryB}::uuid
        WHERE "id"=${f.menuItemId}::uuid`;
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const child = (async () => insertOrderItem(db, f))();
    void child.catch(() => {});

    await waitForLockWait();
    gate.release();
    await parent;

    await expect(child).rejects.toThrow(
      "Restaurant order item menu item must belong to the same workspace",
    );

    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "restaurant_order_items"
      WHERE "restaurantOrderId"=${f.orderId}::uuid`;
    expect(rows[0]!.count).toBe(0);
  }, 30_000);
});
