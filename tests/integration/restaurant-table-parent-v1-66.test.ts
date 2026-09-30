import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];

const workspaceA = randomUUID();
const workspaceB = randomUUID();
const orderTableId = randomUUID();
const kitchenTableId = randomUUID();
const freeTableId = randomUUID();
const orderId = randomUUID();
let userId = "";

describe("restaurant V1.66 table parent identity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    const user = await db.user.create({
      data: { clerkId: `v166-${orderId}`, email: `v166-${orderId}@example.invalid` },
    });
    userId = user.id;
    await db.workspace.createMany({ data: [
      { id: workspaceA, name: `V166 A ${workspaceA}`, vertical: "LEGACY" },
      { id: workspaceB, name: `V166 B ${workspaceB}`, vertical: "LEGACY" },
    ] });
    await db.workspaceMember.create({
      data: { workspaceId: workspaceA, userId, role: "OWNER" },
    });
    await db.$executeRaw`INSERT INTO "restaurant_tables" ("id", "workspaceId", "name", "capacity", "area", "status") VALUES
      (${orderTableId}::uuid, ${workspaceA}::uuid, 'V166 Order Table', 4, 'Hall', 'OCCUPIED'),
      (${kitchenTableId}::uuid, ${workspaceA}::uuid, 'V166 Kitchen Table', 2, 'Patio', 'OCCUPIED'),
      (${freeTableId}::uuid, ${workspaceA}::uuid, 'V166 Free Table', 2, 'Hall', 'AVAILABLE')`;
    await db.$executeRaw`INSERT INTO "restaurant_orders" (
      "id", "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus", "restaurantTableId", "createdById"
    ) VALUES (
      ${orderId}::uuid, ${workspaceA}::uuid, ${`V166-${orderId.slice(0, 8)}`}, 'POS', 'DINE_IN', 'PREPARING', 'PAID', ${orderTableId}::uuid, ${userId}
    )`;
    await db.$executeRaw`INSERT INTO "kitchen_tickets" (
      "workspaceId", "restaurantTableId", "ticketNumber", "status"
    ) VALUES (
      ${workspaceA}::uuid, ${kitchenTableId}::uuid, ${`V166-K-${kitchenTableId.slice(0, 8)}`}, 'PREPARING'
    )`;
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it.each([orderTableId, kitchenTableId])("rejects workspace rewrites for referenced table %s", async tableId => {
    await expect(db.$executeRaw`UPDATE "restaurant_tables" SET "workspaceId"=${workspaceB}::uuid WHERE "id"=${tableId}::uuid`)
      .rejects.toThrow("Restaurant-linked table identity and workspace are immutable");
    const rows = await db.$queryRaw<Array<{ workspaceId: string }>>`
      SELECT "workspaceId"::text AS "workspaceId" FROM "restaurant_tables" WHERE "id"=${tableId}::uuid`;
    expect(rows[0]!.workspaceId).toBe(workspaceA);
  });

  it.each([orderTableId, kitchenTableId])("rejects identity rewrites for referenced table %s", async tableId => {
    const replacement = randomUUID();
    await expect(db.$executeRaw`UPDATE "restaurant_tables" SET "id"=${replacement}::uuid WHERE "id"=${tableId}::uuid`)
      .rejects.toThrow("Restaurant-linked table identity and workspace are immutable");
    expect(await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "restaurant_tables" WHERE "id"=${replacement}::uuid`)
      .toEqual([{ count: 0 }]);
  });

  it.each([orderTableId, kitchenTableId])("rejects deleting referenced table %s instead of erasing the link", async tableId => {
    await expect(db.$executeRaw`DELETE FROM "restaurant_tables" WHERE "id"=${tableId}::uuid`)
      .rejects.toThrow("Restaurant-linked table cannot be deleted");
  });

  it("allows descriptive table edits without changing identity", async () => {
    await db.$executeRaw`UPDATE "restaurant_tables" SET "name"='V166 Renamed', "capacity"=6, "area"='Upper Hall' WHERE "id"=${orderTableId}::uuid`;
    const rows = await db.$queryRaw<Array<{ name: string; capacity: number; area: string | null }>>`
      SELECT "name", "capacity", "area" FROM "restaurant_tables" WHERE "id"=${orderTableId}::uuid`;
    expect(rows).toEqual([{ name: "V166 Renamed", capacity: 6, area: "Upper Hall" }]);
  });

  it("does not freeze an unreferenced table", async () => {
    await db.$executeRaw`UPDATE "restaurant_tables" SET "workspaceId"=${workspaceB}::uuid WHERE "id"=${freeTableId}::uuid`;
    const rows = await db.$queryRaw<Array<{ workspaceId: string }>>`
      SELECT "workspaceId"::text AS "workspaceId" FROM "restaurant_tables" WHERE "id"=${freeTableId}::uuid`;
    expect(rows[0]!.workspaceId).toBe(workspaceB);
    await db.$executeRaw`DELETE FROM "restaurant_tables" WHERE "id"=${freeTableId}::uuid`;
  });
});
