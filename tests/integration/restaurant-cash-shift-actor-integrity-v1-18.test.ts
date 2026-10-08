import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let openRestaurantCashShiftSafely: typeof import("@/lib/server/restaurant-cash-shifts")["openRestaurantCashShiftSafely"];
let closeRestaurantCashShiftFromLedger: typeof import("@/lib/server/restaurant-cash-shifts")["closeRestaurantCashShiftFromLedger"];

const runId = randomUUID();
let workspaceId = "";
let foreignWorkspaceId = "";
let staffAId = "";
let staffBId = "";
let managerId = "";
let foreignId = "";

const staffA = () => ({ workspaceId, role: "STAFF" as const, userId: staffAId });
const forgedForeign = () => ({ workspaceId, role: "STAFF" as const, userId: foreignId });
const forgedManager = () => ({ workspaceId, role: "MANAGER" as const, userId: staffBId });
const manager = () => ({ workspaceId, role: "MANAGER" as const, userId: managerId });

describe("restaurant V1.18 cash shift actor integrity", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ openRestaurantCashShiftSafely, closeRestaurantCashShiftFromLedger } = await import("@/lib/server/restaurant-cash-shifts"));

    const [staffAUser, staffBUser, managerUser, foreignUser] = await Promise.all([
      db.user.create({ data: { clerkId: `shift18-a-${runId}`, email: `shift18-a-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `shift18-b-${runId}`, email: `shift18-b-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `shift18-manager-${runId}`, email: `shift18-manager-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `shift18-foreign-${runId}`, email: `shift18-foreign-${runId}@example.invalid` } }),
    ]);
    staffAId = staffAUser.id;
    staffBId = staffBUser.id;
    managerId = managerUser.id;
    foreignId = foreignUser.id;

    const [workspace, foreignWorkspace] = await Promise.all([
      db.workspace.create({
        data: {
          name: `Cash Shift Actor A ${runId}`,
          vertical: "LEGACY",
          members: {
            create: [
              { userId: staffAId, role: "STAFF" },
              { userId: staffBId, role: "STAFF" },
              { userId: managerId, role: "MANAGER" },
            ],
          },
        },
      }),
      db.workspace.create({
        data: {
          name: `Cash Shift Actor B ${runId}`,
          vertical: "LEGACY",
          members: { create: { userId: foreignId, role: "STAFF" } },
        },
      }),
    ]);
    workspaceId = workspace.id;
    foreignWorkspaceId = foreignWorkspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [staffAId, staffBId, managerId, foreignId] } } });
    await db.$disconnect();
  }, 60_000);

  it("rejects a forged opener from another workspace", async () => {
    await expect(openRestaurantCashShiftSafely(forgedForeign(), 100))
      .rejects.toThrow("Restaurant cash shift opening requires current POS station membership in the same workspace");

    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid AND "status"='OPEN'
    `;
    expect(rows[0]?.count).toBe(0);
  });

  it("blocks a STAFF member who forges MANAGER role from closing another cashier's shift", async () => {
    const shift = await openRestaurantCashShiftSafely(staffA(), 250, "Staff A owns this drawer");

    await expect(closeRestaurantCashShiftFromLedger(forgedManager(), shift.id, 250, "Forged manager close"))
      .rejects.toThrow("Staff can close only the restaurant cash shift they opened.");

    let rows = await db.$queryRaw<Array<{ status: string; closedById: string | null }>>`
      SELECT "status", "closedById"::text AS "closedById" FROM "cash_shifts" WHERE "id"=${shift.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ status: "OPEN", closedById: null });

    const closed = await closeRestaurantCashShiftFromLedger(manager(), shift.id, 250, "Real manager override");
    expect(closed.closedById).toBe(managerId);
    rows = await db.$queryRaw<Array<{ status: string; closedById: string | null }>>`
      SELECT "status", "closedById"::text AS "closedById" FROM "cash_shifts" WHERE "id"=${shift.id}::uuid
    `;
    expect(rows[0]).toMatchObject({ status: "CLOSED", closedById: managerId });
  });

  it("blocks a KITCHEN-only actor from opening a POS cash shift", async () => {
    const prior = await db.workspaceMember.findFirstOrThrow({
      where: { workspaceId, userId: staffBId }, select: { restaurantStation: true },
    });
    const before = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid
    `;
    try {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffBId }, data: { restaurantStation: "KITCHEN" },
      });
      await expect(openRestaurantCashShiftSafely({
        workspaceId, role: "STAFF", userId: staffBId,
      }, 100)).rejects.toThrow(/requires current POS station membership/i);
      const after = await db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid
      `;
      expect(after).toEqual(before);
    } finally {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffBId }, data: { restaurantStation: prior.restaurantStation },
      });
    }
  });

  it("rejects a cashier's drawer close after POS-to-KITCHEN reassignment", async () => {
    const shift = await openRestaurantCashShiftSafely(staffA(), 100, "Ownerless drawer");
    await db.workspaceMember.updateMany({
      where: { workspaceId, userId: staffAId }, data: { restaurantStation: "KITCHEN" },
    });
    try {
      await expect(closeRestaurantCashShiftFromLedger(staffA(), shift.id, 100))
        .rejects.toThrow(/requires current POS station membership/i);
      const status = await db.$queryRaw<Array<{ status: string; closedById: string | null }>>`
        SELECT status, "closedById"::text AS "closedById" FROM "cash_shifts"
        WHERE "id"=${shift.id}::uuid
      `;
      expect(status[0]).toMatchObject({ status: "OPEN", closedById: null });
    } finally {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: staffAId }, data: { restaurantStation: "ALL" },
      });
    }
    await closeRestaurantCashShiftFromLedger(staffA(), shift.id, 100);
  });

  it("denies a demoted manager's stale override while preserving a real manager's override", async () => {
    const shift = await openRestaurantCashShiftSafely(staffA(), 75, "Staff drawer");
    await db.workspaceMember.updateMany({
      where: { workspaceId, userId: managerId }, data: { role: "STAFF" },
    });
    try {
      await expect(closeRestaurantCashShiftFromLedger(manager(), shift.id, 75))
        .rejects.toThrow("Staff can close only the restaurant cash shift they opened.");
      const stillOpen = await db.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM "cash_shifts" WHERE "id"=${shift.id}::uuid
      `;
      expect(stillOpen[0]?.status).toBe("OPEN");
    } finally {
      await db.workspaceMember.updateMany({
        where: { workspaceId, userId: managerId }, data: { role: "MANAGER" },
      });
    }
    const closed = await closeRestaurantCashShiftFromLedger(manager(), shift.id, 75);
    expect(closed.closedById).toBe(managerId);
  });

  it("prevents direct ownership rewrites", async () => {
    const shift = await openRestaurantCashShiftSafely(staffA(), 50, "Immutable opener");

    await expect(db.$executeRaw`
      UPDATE "cash_shifts"
      SET "openedById"=${staffBId}::uuid
      WHERE "id"=${shift.id}::uuid AND "workspaceId"=${workspaceId}::uuid
    `).rejects.toThrow("Restaurant cash shift ownership is immutable");

    const rows = await db.$queryRaw<Array<{ openedById: string | null }>>`
      SELECT "openedById"::text AS "openedById" FROM "cash_shifts" WHERE "id"=${shift.id}::uuid
    `;
    expect(rows[0]?.openedById).toBe(staffAId);
    await closeRestaurantCashShiftFromLedger(staffA(), shift.id, 50);
  });
});