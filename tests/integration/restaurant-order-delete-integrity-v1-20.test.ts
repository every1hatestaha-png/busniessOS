import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const runId = randomUUID();
const appRole = "restaurant_v120_app";
let userId = "";
let workspaceId = "";
let pendingOrderId = "";
let pendingItemId = "";
let committedOrderId = "";
let committedItemId = "";

async function deleteAsApp(sql: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${appRole}`);
    return tx.$executeRawUnsafe(sql);
  });
}

describe("restaurant V1.20 order and item delete integrity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));

    const user = await db.user.create({
      data: {
        clerkId: `restaurant-v120-${runId}`,
        email: `restaurant-v120-${runId}@example.invalid`,
      },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Restaurant V1.20 ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;

    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const pendingRows = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_orders" (
        "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus",
        "subtotal", "discountAmount", "taxAmount", "total"
      ) VALUES (
        ${workspaceId}::uuid, ${`V120-PENDING-${runId}`}, 'WHATSAPP', 'TAKEAWAY',
        'PENDING_REVIEW', 'UNPAID', 100, 0, 0, 100
      )
      RETURNING "id"::text AS "id"
    `;
    pendingOrderId = pendingRows[0]!.id;

    const pendingItemRows = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_order_items" (
        "restaurantOrderId", "itemName", "quantity", "unitPrice", "lineTotal"
      ) VALUES (${pendingOrderId}::uuid, 'Uncommitted item', 1, 100, 100)
      RETURNING "id"::text AS "id"
    `;
    pendingItemId = pendingItemRows[0]!.id;

    const committedRows = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_orders" (
        "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus",
        "subtotal", "discountAmount", "taxAmount", "total"
      ) VALUES (
        ${workspaceId}::uuid, ${`V120-COMMITTED-${runId}`}, 'WHATSAPP', 'TAKEAWAY',
        'PENDING_REVIEW', 'UNPAID', 200, 0, 0, 200
      )
      RETURNING "id"::text AS "id"
    `;
    committedOrderId = committedRows[0]!.id;

    const committedItemRows = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_order_items" (
        "restaurantOrderId", "itemName", "quantity", "unitPrice", "lineTotal"
      ) VALUES (${committedOrderId}::uuid, 'Committed item', 1, 200, 200)
      RETURNING "id"::text AS "id"
    `;
    committedItemId = committedItemRows[0]!.id;

    await db.$executeRaw`
      UPDATE "restaurant_orders"
      SET "status"='CONFIRMED', "confirmedById"=${userId}, "confirmedAt"=now(), "updatedAt"=now()
      WHERE "id"=${committedOrderId}::uuid
    `;

    await db.$executeRawUnsafe(`CREATE ROLE ${appRole} NOLOGIN`);
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    // The trigger intentionally takes FOR KEY SHARE on the parent so a concurrent
    // confirmation cannot race an item delete. PostgreSQL requires UPDATE privilege
    // for that row-lock clause, matching the DML privileges held by a real app role.
    await db.$executeRawUnsafe(
      `GRANT SELECT, UPDATE, DELETE ON TABLE "restaurant_orders", "restaurant_order_items" TO ${appRole}`,
    );
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    // CI uses PostgreSQL's superuser for migrations/tests. V1.20 intentionally
    // leaves that unavoidable DBA maintenance path open, so teardown remains
    // possible without weakening the application-role invariant.
    await db.$executeRaw`DELETE FROM "restaurant_order_items" WHERE "restaurantOrderId" IN (SELECT "id" FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid)`;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_order_sequences" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$executeRawUnsafe(`DROP OWNED BY ${appRole}`);
    await db.$executeRawUnsafe(`DROP ROLE ${appRole}`);
    await db.$disconnect();
  }, 60_000);

  it("allows direct line cleanup while an order is still truly uncommitted", async () => {
    await expect(
      deleteAsApp(`DELETE FROM "restaurant_order_items" WHERE "id"='${pendingItemId}'::uuid`),
    ).resolves.toBe(1);

    const remaining = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS "count"
      FROM "restaurant_order_items"
      WHERE "id"=${pendingItemId}::uuid
    `;
    expect(Number(remaining[0]!.count)).toBe(0);

    const replacementRows = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_order_items" (
        "restaurantOrderId", "itemName", "quantity", "unitPrice", "lineTotal"
      ) VALUES (${pendingOrderId}::uuid, 'Replacement uncommitted item', 1, 100, 100)
      RETURNING "id"::text AS "id"
    `;
    pendingItemId = replacementRows[0]!.id;
  });

  it("rejects direct deletion of a committed order line and preserves it", async () => {
    await expect(
      deleteAsApp(`DELETE FROM "restaurant_order_items" WHERE "id"='${committedItemId}'::uuid`),
    ).rejects.toThrow("Restaurant order item history cannot be deleted after commitment");

    const stored = await db.$queryRaw<Array<{ orderId: string; itemName: string }>>`
      SELECT "restaurantOrderId"::text AS "orderId", "itemName"
      FROM "restaurant_order_items"
      WHERE "id"=${committedItemId}::uuid
    `;
    expect(stored).toHaveLength(1);
    expect(stored[0]!.orderId).toBe(committedOrderId);
    expect(stored[0]!.itemName).toBe("Committed item");
  });

  it("rejects parent deletion after commitment instead of cascading away history", async () => {
    await expect(
      deleteAsApp(`DELETE FROM "restaurant_orders" WHERE "id"='${committedOrderId}'::uuid`),
    ).rejects.toThrow("Restaurant order history cannot be deleted after commitment");

    const [orders, items] = await Promise.all([
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS "count" FROM "restaurant_orders" WHERE "id"=${committedOrderId}::uuid
      `,
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS "count" FROM "restaurant_order_items" WHERE "restaurantOrderId"=${committedOrderId}::uuid
      `,
    ]);
    expect(Number(orders[0]!.count)).toBe(1);
    expect(Number(items[0]!.count)).toBe(1);
  });

  it("allows an uncommitted parent cleanup and preserves its FK cascade", async () => {
    await expect(
      deleteAsApp(`DELETE FROM "restaurant_orders" WHERE "id"='${pendingOrderId}'::uuid`),
    ).resolves.toBe(1);

    const [orders, items] = await Promise.all([
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS "count" FROM "restaurant_orders" WHERE "id"=${pendingOrderId}::uuid
      `,
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS "count" FROM "restaurant_order_items" WHERE "restaurantOrderId"=${pendingOrderId}::uuid
      `,
    ]);
    expect(Number(orders[0]!.count)).toBe(0);
    expect(Number(items[0]!.count)).toBe(0);
  });
});
