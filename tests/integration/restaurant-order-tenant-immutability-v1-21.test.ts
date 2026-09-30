import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
const runId = randomUUID();
let userId = "";
let workspaceA = "";
let workspaceB = "";

describe("restaurant V1.21 order tenant immutability", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    const user = await db.user.create({ data: { clerkId: `v121-${runId}`, email: `v121-${runId}@example.invalid` } });
    userId = user.id;
    const workspaces = await Promise.all(["A", "B"].map((suffix) => db.workspace.create({
      data: { name: `Order tenant ${suffix} ${runId}`, vertical: "LEGACY", members: { create: { userId, role: "STAFF" } } },
    })));
    [workspaceA, workspaceB] = workspaces.map((w) => w.id);
  });

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId" IN (${workspaceA}::uuid, ${workspaceB}::uuid)`;
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  for (const status of ["PENDING_REVIEW", "CONFIRMED"] as const) {
    it(`rejects a dual-member tenant rewrite for ${status} and preserves normal updates`, async () => {
      const rows = await db.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "restaurant_orders" ("workspaceId", "orderNumber", "source", "fulfillmentType", "status", "createdById", "subtotal", "total")
        VALUES (${workspaceA}::uuid, ${`V121-${status}-${runId}`}, 'MANUAL', 'TAKEAWAY', ${status}, ${userId}, 100, 100)
        RETURNING "id"::text AS "id"
      `;
      const id = rows[0]!.id;
      await db.$executeRaw`
        INSERT INTO "restaurant_order_items" ("restaurantOrderId", "itemName", "quantity", "unitPrice", "lineTotal")
        VALUES (${id}::uuid, 'Original line', 1, 100, 100)
      `;
      await expect(db.$executeRaw`
        UPDATE "restaurant_orders" SET "workspaceId"=${workspaceB}::uuid WHERE "id"=${id}::uuid
      `).rejects.toThrow("Restaurant order workspace is immutable");
      // Explicitly writing the existing tenant is valid, as are operational notes.
      await db.$executeRaw`
        UPDATE "restaurant_orders" SET "workspaceId"=${workspaceA}::uuid, "notes"='Normal update' WHERE "id"=${id}::uuid
      `;
      const persisted = await db.$queryRaw<Array<{ workspaceId: string; status: string; notes: string; lineCount: number }>>`
        SELECT ro."workspaceId"::text AS "workspaceId", ro."status", ro."notes",
          (SELECT COUNT(*)::int FROM "restaurant_order_items" i WHERE i."restaurantOrderId"=ro."id") AS "lineCount"
        FROM "restaurant_orders" ro WHERE ro."id"=${id}::uuid
      `;
      expect(persisted).toEqual([{ workspaceId: workspaceA, status, notes: "Normal update", lineCount: 1 }]);
      if (status === "PENDING_REVIEW") {
        await db.$executeRaw`
          UPDATE "restaurant_orders" SET "status"='CONFIRMED', "confirmedById"=${userId}, "confirmedAt"=now() WHERE "id"=${id}::uuid
        `;
        const confirmed = await db.$queryRaw<Array<{ status: string; workspaceId: string }>>`
          SELECT "status", "workspaceId"::text AS "workspaceId" FROM "restaurant_orders" WHERE "id"=${id}::uuid
        `;
        expect(confirmed).toEqual([{ status: "CONFIRMED", workspaceId: workspaceA }]);
      }
    });
  }
});
