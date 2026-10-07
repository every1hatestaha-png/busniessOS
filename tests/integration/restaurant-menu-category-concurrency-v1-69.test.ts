import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
type RawExecutor = Pick<typeof db, "$executeRaw">;

async function fixture() {
  const id = randomUUID();
  const [workspace, otherWorkspace] = await Promise.all([
    db.workspace.create({ data: { name: `V169 ${id}`, vertical: "LEGACY" } }),
    db.workspace.create({ data: { name: `V169 other ${id}`, vertical: "LEGACY" } }),
  ]);
  const categoryId = randomUUID();
  await db.$executeRaw`INSERT INTO "restaurant_menu_categories" (
    "id", "workspaceId", "name", "sortOrder", "isActive"
  ) VALUES (
    ${categoryId}::uuid, ${workspace.id}::uuid, ${`V169 ${id}`}, 1, true
  )`;
  return { workspaceId: workspace.id, otherWorkspaceId: otherWorkspace.id, categoryId };
}

async function insertMenuItem(tx: RawExecutor, f: Awaited<ReturnType<typeof fixture>>) {
  const menuItemId = randomUUID();
  await tx.$executeRaw`INSERT INTO "restaurant_menu_items" (
    "id", "workspaceId", "categoryId", "name", "price", "sortOrder", "isActive", "isAvailable"
  ) VALUES (
    ${menuItemId}::uuid, ${f.workspaceId}::uuid, ${f.categoryId}::uuid,
    ${`V169 Item ${menuItemId}`}, 25, 1, true, true
  )`;
  return menuItemId;
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

describe("restaurant V1.69 menu category reference concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("lets the first menu-item reference commit before rejecting a concurrent category move", async () => {
    const f = await fixture();
    const gate = controlledHold();
    const child = db.$transaction(async tx => {
      await insertMenuItem(tx, f);
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const parentMove = (async () => db.$executeRaw`
      UPDATE "restaurant_menu_categories"
      SET "workspaceId"=${f.otherWorkspaceId}::uuid
      WHERE "id"=${f.categoryId}::uuid
    `)();
    void parentMove.catch(() => {});
    await waitForLockWait();
    gate.release();
    await child;

    await expect(parentMove).rejects.toThrow("Restaurant-linked menu category identity and workspace are immutable");
  }, 30_000);

  it("revalidates a stale menu-item reference after a concurrent category move commits first", async () => {
    const f = await fixture();
    const gate = controlledHold();
    const parent = db.$transaction(async tx => {
      await tx.$executeRaw`
        UPDATE "restaurant_menu_categories"
        SET "workspaceId"=${f.otherWorkspaceId}::uuid
        WHERE "id"=${f.categoryId}::uuid`;
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const child = (async () => insertMenuItem(db, f))();
    void child.catch(() => {});
    await waitForLockWait();
    gate.release();
    await parent;

    await expect(child).rejects.toThrow("Restaurant menu category must belong to the same workspace");
    const count = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "restaurant_menu_items"
      WHERE "categoryId"=${f.categoryId}::uuid`;
    expect(count[0]!.count).toBe(0);
  }, 30_000);
});
