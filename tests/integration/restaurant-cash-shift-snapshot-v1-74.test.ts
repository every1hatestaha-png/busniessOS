import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let openShift: typeof import("@/lib/server/restaurant-cash-shifts")["openRestaurantCashShiftSafely"];
let closeShift: typeof import("@/lib/server/restaurant-cash-shifts")["closeRestaurantCashShiftFromLedger"];

const runId = randomUUID();
const appRole = `restaurant_v174_${runId.replaceAll("-", "")}`;
let workspaceId = "";
let userId = "";
const actor = () => ({ workspaceId, userId, role: "OWNER" as const });

async function asApp(sql: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${appRole}`);
    return tx.$executeRawUnsafe(sql);
  });
}

async function snapshot(shiftId: string) {
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM "cash_shifts" WHERE "id"=${shiftId}::uuid
  `;
  return rows[0]!;
}

describe("restaurant V1.74 cash shift snapshot integrity", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({
      openRestaurantCashShiftSafely: openShift,
      closeRestaurantCashShiftFromLedger: closeShift,
    } = await import("@/lib/server/restaurant-cash-shifts"));

    const user = await db.user.create({
      data: { clerkId: `v174-${runId}`, email: `v174-${runId}@example.invalid` },
    });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: {
        name: `Cash shift snapshot ${runId}`,
        vertical: "LEGACY",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    await db.$executeRawUnsafe(`CREATE ROLE ${appRole} NOLOGIN`);
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${appRole}`);
    await db.$executeRawUnsafe(`GRANT INSERT, UPDATE, DELETE ON "cash_shifts" TO ${appRole}`);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$executeRawUnsafe(`DROP OWNED BY ${appRole}`);
    await db.$executeRawUnsafe(`DROP ROLE ${appRole}`);
    await db.$disconnect();
  }, 60_000);

  it("requires a clean OPEN creation state and preserves opening identity", async () => {
    await expect(asApp(`
      INSERT INTO "cash_shifts" (
        "workspaceId", "openedById", "status", "openingCash", "closedAt", "closedById",
        "expectedCash", "closingCash", "variance"
      ) VALUES (
        '${workspaceId}'::uuid, '${userId}'::uuid, 'CLOSED', 100, now(), '${userId}'::uuid, 100, 100, 0
      )
    `)).rejects.toThrow("Restaurant cash shift must begin open without closure values");

    const shift = await openShift(actor(), 100, "Immutable opening");
    const before = await snapshot(shift.id);
    await expect(asApp(`UPDATE "cash_shifts" SET "openingCash"=101 WHERE "id"='${shift.id}'::uuid`))
      .rejects.toThrow("Restaurant cash shift opening snapshot is immutable");
    await expect(asApp(`UPDATE "cash_shifts" SET "openedAt"="openedAt" + interval '1 second' WHERE "id"='${shift.id}'::uuid`))
      .rejects.toThrow("Restaurant cash shift opening snapshot is immutable");
    expect(await snapshot(shift.id)).toEqual(before);

    await closeShift(actor(), shift.id, 100, "Normal close");
  });

  it("freezes a closed shift and rejects application-role deletion", async () => {
    const shift = await openShift(actor(), 250, "Closing snapshot");
    await closeShift(actor(), shift.id, 260, "Counted drawer");
    const before = await snapshot(shift.id);

    const updates = [
      `UPDATE "cash_shifts" SET "status"='OPEN' WHERE "id"='${shift.id}'::uuid`,
      `UPDATE "cash_shifts" SET "closedAt"="closedAt" + interval '1 second' WHERE "id"='${shift.id}'::uuid`,
      `UPDATE "cash_shifts" SET "expectedCash"="expectedCash" + 1 WHERE "id"='${shift.id}'::uuid`,
      `UPDATE "cash_shifts" SET "closingCash"="closingCash" + 1, "variance"="variance" + 1 WHERE "id"='${shift.id}'::uuid`,
      `UPDATE "cash_shifts" SET "notes"='rewritten history' WHERE "id"='${shift.id}'::uuid`,
    ];
    for (const update of updates) {
      await expect(asApp(update)).rejects.toThrow("Restaurant closed cash shift history is immutable");
      expect(await snapshot(shift.id)).toEqual(before);
    }

    await expect(asApp(`DELETE FROM "cash_shifts" WHERE "id"='${shift.id}'::uuid`))
      .rejects.toThrow("Restaurant cash shift history cannot be deleted");
    expect(await snapshot(shift.id)).toEqual(before);
  });
});
