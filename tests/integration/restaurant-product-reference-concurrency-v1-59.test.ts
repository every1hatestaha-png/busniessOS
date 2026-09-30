import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

async function fixture() {
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const productId = randomUUID();
  await db.workspace.createMany({ data: [
    { id: workspaceA, name: `V159 A ${workspaceA}`, vertical: "LEGACY" },
    { id: workspaceB, name: `V159 B ${workspaceB}`, vertical: "LEGACY" },
  ] });
  await db.product.create({ data: { id: productId, workspaceId: workspaceA, name: `V159 product ${productId}` } });
  return { workspaceA, workspaceB, productId };
}

async function waitForLockWait() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'`;
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

describe("restaurant V1.59 Product parent/reference concurrency", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("rejects a Product workspace move that races behind a newly committed recipe reference", async () => {
    const f = await fixture();
    const recipeId = randomUUID();
    const gate = controlledHold();

    const child = db.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
        VALUES (${recipeId}::uuid, ${f.workspaceA}::uuid, ${f.productId}::uuid, 1)`;
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const parentMove = db.product.update({ where: { id: f.productId }, data: { workspaceId: f.workspaceB } });
    await waitForLockWait();
    gate.release();
    await child;

    await expect(parentMove).rejects.toThrow("Restaurant-linked product identity and workspace are immutable");
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).workspaceId).toBe(f.workspaceA);
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "recipes" WHERE "id"=${recipeId}::uuid`;
    expect(rows[0]!.count).toBe(1);
  }, 30_000);

  it("rejects a stale recipe reference that races behind a committed Product workspace move", async () => {
    const f = await fixture();
    const recipeId = randomUUID();
    const gate = controlledHold();

    const parent = db.$transaction(async tx => {
      await tx.product.update({ where: { id: f.productId }, data: { workspaceId: f.workspaceB } });
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const staleChild = db.$executeRaw`INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
      VALUES (${recipeId}::uuid, ${f.workspaceA}::uuid, ${f.productId}::uuid, 1)`;
    await waitForLockWait();
    gate.release();
    await parent;

    await expect(staleChild).rejects.toThrow("Restaurant recipe finished product must belong to the same workspace");
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).workspaceId).toBe(f.workspaceB);
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "recipes" WHERE "id"=${recipeId}::uuid`;
    expect(rows[0]!.count).toBe(0);
  }, 30_000);

  it("rejects Product deletion that races behind a newly committed recipe reference", async () => {
    const f = await fixture();
    const recipeId = randomUUID();
    const gate = controlledHold();

    const child = db.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
        VALUES (${recipeId}::uuid, ${f.workspaceA}::uuid, ${f.productId}::uuid, 1)`;
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const deletion = db.product.delete({ where: { id: f.productId } });
    await waitForLockWait();
    gate.release();
    await child;

    await expect(deletion).rejects.toThrow("Restaurant-linked product cannot be deleted while referenced by a recipe");
    expect(await db.product.findUnique({ where: { id: f.productId } })).not.toBeNull();
  }, 30_000);

  it("rejects a stale recipe reference that races behind a committed Product deletion", async () => {
    const f = await fixture();
    const recipeId = randomUUID();
    const gate = controlledHold();

    const parent = db.$transaction(async tx => {
      await tx.product.delete({ where: { id: f.productId } });
      gate.ready();
      await gate.hold;
    }, { timeout: 20_000 });

    await gate.signal;
    const staleChild = db.$executeRaw`INSERT INTO "recipes" ("id", "workspaceId", "finishedProductId", "yieldQuantity")
      VALUES (${recipeId}::uuid, ${f.workspaceA}::uuid, ${f.productId}::uuid, 1)`;
    await waitForLockWait();
    gate.release();
    await parent;

    await expect(staleChild).rejects.toThrow("Restaurant recipe finished product must belong to the same workspace");
    expect(await db.product.findUnique({ where: { id: f.productId } })).toBeNull();
  }, 30_000);
});
