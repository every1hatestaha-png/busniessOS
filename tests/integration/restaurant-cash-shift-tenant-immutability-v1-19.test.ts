import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let openRestaurantCashShiftSafely: typeof import("@/lib/server/restaurant-cash-shifts")["openRestaurantCashShiftSafely"];
let closeRestaurantCashShiftFromLedger: typeof import("@/lib/server/restaurant-cash-shifts")["closeRestaurantCashShiftFromLedger"];

const runId = randomUUID();
let userId = "";
let workspaceAId = "";
let workspaceBId = "";

const actorA = () => ({ workspaceId: workspaceAId, role: "STAFF" as const, userId });

async function enableRestaurant(workspaceId: string) {
  await db.$executeRaw`
    INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
    VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
  `;
}

describe("restaurant V1.19 cash shift tenant immutability", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ openRestaurantCashShiftSafely, closeRestaurantCashShiftFromLedger } = await import("@/lib/server/restaurant-cash-shifts"));

    const user = await db.user.create({
      data: { clerkId: `shift19-dual-${runId}`, email: `shift19-dual-${runId}@example.invalid` },
    });
    userId = user.id;

    const [workspaceA, workspaceB] = await Promise.all([
      db.workspace.create({
        data: {
          name: `Cash Shift Tenant A ${runId}`,
          vertical: "LEGACY",
          members: { create: { userId, role: "STAFF" } },
        },
      }),
      db.workspace.create({
        data: {
          name: `Cash Shift Tenant B ${runId}`,
          vertical: "LEGACY",
          members: { create: { userId, role: "STAFF" } },
        },
      }),
    ]);
    workspaceAId = workspaceA.id;
    workspaceBId = workspaceB.id;
    await Promise.all([enableRestaurant(workspaceAId), enableRestaurant(workspaceBId)]);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "cash_shifts" WHERE "workspaceId" IN (${workspaceAId}::uuid, ${workspaceBId}::uuid)`;
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId" IN (${workspaceAId}::uuid, ${workspaceBId}::uuid)`;
    await db.auditLog.deleteMany({ where: { workspaceId: { in: [workspaceAId, workspaceBId] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceAId, workspaceBId] } } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("blocks moving an existing shift to another workspace even when the opener belongs to both", async () => {
    const shift = await openRestaurantCashShiftSafely(actorA(), 300, "Tenant-bound drawer");

    await expect(db.$executeRaw`
      UPDATE "cash_shifts"
      SET "workspaceId"=${workspaceBId}::uuid
      WHERE "id"=${shift.id}::uuid AND "workspaceId"=${workspaceAId}::uuid
    `).rejects.toThrow("Restaurant cash shift workspace is immutable");

    const rows = await db.$queryRaw<Array<{ workspaceId: string; openedById: string | null; status: string }>>`
      SELECT "workspaceId"::text AS "workspaceId", "openedById"::text AS "openedById", "status"
      FROM "cash_shifts"
      WHERE "id"=${shift.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ workspaceId: workspaceAId, openedById: userId, status: "OPEN" });

    const closed = await closeRestaurantCashShiftFromLedger(actorA(), shift.id, 300, "Normal close after rejected tenant rewrite");
    expect(closed.status).toBe("CLOSED");
    expect(closed.workspaceId).toBe(workspaceAId);
  });
});
