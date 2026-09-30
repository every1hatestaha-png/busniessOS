import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
type RawExecutor = Pick<typeof db, "$executeRaw">;

async function fixture() {
  const id = randomUUID();
  const [workspace, otherWorkspace] = await Promise.all([
    db.workspace.create({ data: { name: `V167 ${id}`, vertical: "LEGACY" } }),
    db.workspace.create({ data: { name: `V167 other ${id}`, vertical: "LEGACY" } }),
  ]);
  const tableId = randomUUID();
  await db.$executeRaw`INSERT INTO "restaurant_tables" ("id", "workspaceId", "name", "capacity", "status")
    VALUES (${tableId}::uuid, ${workspace.id}::uuid, ${`V167 ${id}`}, 4, 'AVAILABLE')`;
  return { id, workspaceId: workspace.id, otherWorkspaceId: otherWorkspace.id, tableId };
}

async function insertOrder(tx: RawExecutor, f: Awaited<ReturnType<typeof fixture>>) {
  const orderId = randomUUID();
  await tx.$executeRaw`INSERT INTO "restaurant_orders" (
    "id", "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "restaurantTableId"
  ) VALUES (
    ${orderId}::uuid, ${f.workspaceId}::uuid, ${`V167-O-${orderId.slice(0, 8)}`}, 'POS', 'DINE_IN', 'CONFIRMED', ${f.tableId}::uuid
  )`;
  return orderId;
}

async function insertTicket(tx: RawExecutor, f: Awaited<ReturnType<typeof fixture>>) {
  const ticketId = randomUUID();
  await tx.$executeRaw`INSERT INTO "kitchen_tickets" (
    "id", "workspaceId", "restaurantTableId", "ticketNumber", "status"
  ) VALUES (
    ${ticketId}::uuid, ${f.workspaceId}::uuid, ${f.tableId}::uuid, ${`V167-K-${ticketId.slice(0, 8)}`}, 'QUEUED'
  )`;
  return ticketId;
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

describe("restaurant V1.67 table reference concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("lets an order reference commit first and then rejects the concurrent table move", async () => {
    const f = await fixture();
    const gate = controlledHold();
    const child = db.$transaction(async tx => {
      await insertOrder(tx, f);
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const parentMove = (async () => db.$executeRaw`
      UPDATE "restaurant_tables" SET "workspaceId"=${f.otherWorkspaceId}::uuid WHERE "id"=${f.tableId}::uuid
    `)();
    void parentMove.catch(() => {});
    await waitForLockWait();
    gate.release();
    await child;

    await expect(parentMove).rejects.toThrow("Restaurant-linked table identity and workspace are immutable");
  }, 30_000);

  it("rejects a stale order reference after the table move commits first", async () => {
    const f = await fixture();
    const gate = controlledHold();
    const parent = db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "restaurant_tables" SET "workspaceId"=${f.otherWorkspaceId}::uuid WHERE "id"=${f.tableId}::uuid`;
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const child = (async () => insertOrder(db, f))();
    void child.catch(() => {});
    await waitForLockWait();
    gate.release();
    await parent;

    await expect(child).rejects.toThrow("Restaurant order table must belong to the same workspace");
  }, 30_000);

  it("lets a kitchen ticket reference commit first and then rejects the concurrent table move", async () => {
    const f = await fixture();
    const gate = controlledHold();
    const child = db.$transaction(async tx => {
      await insertTicket(tx, f);
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const parentMove = (async () => db.$executeRaw`
      UPDATE "restaurant_tables" SET "workspaceId"=${f.otherWorkspaceId}::uuid WHERE "id"=${f.tableId}::uuid
    `)();
    void parentMove.catch(() => {});
    await waitForLockWait();
    gate.release();
    await child;

    await expect(parentMove).rejects.toThrow("Restaurant-linked table identity and workspace are immutable");
  }, 30_000);

  it("rejects a stale kitchen ticket reference after the table move commits first", async () => {
    const f = await fixture();
    const gate = controlledHold();
    const parent = db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "restaurant_tables" SET "workspaceId"=${f.otherWorkspaceId}::uuid WHERE "id"=${f.tableId}::uuid`;
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const child = (async () => insertTicket(db, f))();
    void child.catch(() => {});
    await waitForLockWait();
    gate.release();
    await parent;

    await expect(child).rejects.toThrow("Kitchen ticket table must belong to the same workspace");
  }, 30_000);
});
