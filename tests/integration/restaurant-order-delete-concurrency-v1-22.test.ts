import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
const runId = randomUUID();
const appRole = `restaurant_v122_${runId.replaceAll("-", "")}`;
let userId = "";
let workspaceId = "";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture() {
  const orders = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "restaurant_orders" ("workspaceId", "orderNumber", "source", "fulfillmentType", "subtotal", "total")
    VALUES (${workspaceId}::uuid, ${randomUUID()}, 'WHATSAPP', 'TAKEAWAY', 100, 100)
    RETURNING "id"::text AS "id"
  `;
  const orderId = orders[0]!.id;
  const items = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "restaurant_order_items" ("restaurantOrderId", "itemName", "quantity", "unitPrice", "lineTotal")
    VALUES (${orderId}::uuid, 'Concurrent line', 1, 100, 100)
    RETURNING "id"::text AS "id"
  `;
  return { orderId, itemId: items[0]!.id };
}

async function deleteAsApp(itemId: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${appRole}`);
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1000ms'");
    return tx.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "id"=${itemId}::uuid`;
  }, { timeout: 10_000 });
}

async function assertIntact(orderId: string, itemId: string) {
  const rows = await db.$queryRaw<Array<{ status: string; itemCount: number }>>`
    SELECT "status", (SELECT COUNT(*)::int FROM "restaurant_order_items" WHERE "id"=${itemId}::uuid) AS "itemCount"
    FROM "restaurant_orders" WHERE "id"=${orderId}::uuid
  `;
  expect(rows).toEqual([{ status: "CONFIRMED", itemCount: 1 }]);
}

describe("restaurant V1.22 concurrent line deletion and commitment", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    const user = await db.user.create({ data: { clerkId: `v122-${runId}`, email: `v122-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Deletion concurrency ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "STAFF" } } } });
    workspaceId = workspace.id;
    await db.$executeRawUnsafe(`CREATE ROLE ${appRole} NOLOGIN`);
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT SELECT, UPDATE, DELETE ON "restaurant_orders", "restaurant_order_items" TO ${appRole}`);
  });

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$executeRawUnsafe(`DROP OWNED BY ${appRole}`);
    await db.$executeRawUnsafe(`DROP ROLE ${appRole}`);
    await db.$disconnect();
  });

  it("blocks a status-only confirmation while line cleanup holds its parent lock", async () => {
    const { orderId, itemId } = await fixture();
    const ready = deferred();
    const release = deferred();
    const rollback = new Error("rollback synthetic cleanup");
    const cleanup = db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${appRole}`);
      await tx.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "id"=${itemId}::uuid`;
      ready.resolve();
      await release.promise;
      throw rollback;
    }, { timeout: 15_000 }).catch((error: unknown) => { if (error !== rollback) throw error; });
    await Promise.race([ready.promise, cleanup.then(() => { throw new Error("cleanup exited before acquiring lock"); })]);
    try {
      await expect(db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1000ms'");
        return tx.$executeRaw`
          UPDATE "restaurant_orders" SET "status"='CONFIRMED', "confirmedById"=${userId}, "confirmedAt"=now()
          WHERE "id"=${orderId}::uuid
        `;
      }, { timeout: 10_000 })).rejects.toThrow(/lock timeout/);
    } finally {
      release.resolve();
      await cleanup;
    }
    await db.$executeRaw`
      UPDATE "restaurant_orders" SET "status"='CONFIRMED', "confirmedById"=${userId}, "confirmedAt"=now() WHERE "id"=${orderId}::uuid
    `;
    await expect(deleteAsApp(itemId)).rejects.toThrow("Restaurant order item history cannot be deleted after commitment");
    await assertIntact(orderId, itemId);
  }, 20_000);

  it("blocks cleanup behind an uncommitted status update, then rejects it after confirmation commits", async () => {
    const { orderId, itemId } = await fixture();
    const ready = deferred();
    const release = deferred();
    const confirmation = db.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "restaurant_orders" SET "status"='CONFIRMED', "confirmedById"=${userId}, "confirmedAt"=now() WHERE "id"=${orderId}::uuid
      `;
      ready.resolve();
      await release.promise;
    }, { timeout: 15_000 });
    await Promise.race([ready.promise, confirmation.then(() => { throw new Error("confirmation exited before acquiring lock"); })]);
    try {
      await expect(deleteAsApp(itemId)).rejects.toThrow(/lock timeout/);
    } finally {
      release.resolve();
      await confirmation;
    }
    await expect(deleteAsApp(itemId)).rejects.toThrow("Restaurant order item history cannot be deleted after commitment");
    await assertIntact(orderId, itemId);
  }, 20_000);

  it("still permits truly pending line cleanup and parent cascade", async () => {
    const first = await fixture();
    await expect(deleteAsApp(first.itemId)).resolves.toBe(1);
    const second = await fixture();
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${appRole}`);
      await tx.$executeRaw`DELETE FROM "restaurant_orders" WHERE "id"=${second.orderId}::uuid`;
    });
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_order_items" WHERE "id"=${second.itemId}::uuid
    `;
    expect(rows).toEqual([{ count: 0 }]);
  });
});
