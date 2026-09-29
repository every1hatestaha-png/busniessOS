import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let openRestaurantCashShiftSafely: typeof import("@/lib/server/restaurant-cash-shifts")["openRestaurantCashShiftSafely"];
let closeRestaurantCashShiftFromLedger: typeof import("@/lib/server/restaurant-cash-shifts")["closeRestaurantCashShiftFromLedger"];

const runId = randomUUID();
let workspaceId = "";
let staffAId = "";
let staffBId = "";
let managerId = "";

const staffA = () => ({ workspaceId, role: "STAFF" as const, userId: staffAId });
const staffB = () => ({ workspaceId, role: "STAFF" as const, userId: staffBId });
const manager = () => ({ workspaceId, role: "MANAGER" as const, userId: managerId });

describe("restaurant V1.8 cash shift ownership authorization", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ openRestaurantCashShiftSafely, closeRestaurantCashShiftFromLedger } = await import("@/lib/server/restaurant-cash-shifts"));

    const [staffAUser, staffBUser, managerUser] = await Promise.all([
      db.user.create({ data: { clerkId: `shift-staff-a-${runId}`, email: `shift-staff-a-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `shift-staff-b-${runId}`, email: `shift-staff-b-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `shift-manager-${runId}`, email: `shift-manager-${runId}@example.invalid` } }),
    ]);
    staffAId = staffAUser.id;
    staffBId = staffBUser.id;
    managerId = managerUser.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Shift Auth ${runId}`,
        vertical: "LEGACY",
        members: {
          create: [
            { userId: staffAId, role: "STAFF" },
            { userId: staffBId, role: "STAFF" },
            { userId: managerId, role: "MANAGER" },
          ],
        },
      },
    });
    workspaceId = workspace.id;
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
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [staffAId, staffBId, managerId] } } });
    await db.$disconnect();
  }, 60_000);

  it("blocks unrelated staff and allows the staff member who opened the shift", async () => {
    const shift = await openRestaurantCashShiftSafely(staffA(), 500, "Staff A opening count");
    await expect(closeRestaurantCashShiftFromLedger(staffB(), shift.id, 500, "Staff B attempted close"))
      .rejects.toThrow("Staff can close only the restaurant cash shift they opened.");

    const stillOpen = await db.$queryRaw<Array<{ status: string; closedById: string | null }>>`
      SELECT "status", "closedById"::text AS "closedById" FROM "cash_shifts" WHERE "id"=${shift.id}::uuid
    `;
    expect(stillOpen[0]).toMatchObject({ status: "OPEN", closedById: null });

    const closed = await closeRestaurantCashShiftFromLedger(staffA(), shift.id, 500, "Staff A closing count");
    expect(closed.closedById).toBe(staffAId);
    const audit = await db.auditLog.findMany({ where: { workspaceId, action: "restaurant.cash_shift.closed", entityId: shift.id } });
    expect(audit).toHaveLength(1);
  });

  it("allows a manager to close another user's open shift and records the override", async () => {
    const shift = await openRestaurantCashShiftSafely(staffA(), 250, "Staff A second shift");
    const closed = await closeRestaurantCashShiftFromLedger(manager(), shift.id, 250, "Manager override close");
    expect(closed.openedById).toBe(staffAId);
    expect(closed.closedById).toBe(managerId);

    const audit = await db.auditLog.findMany({ where: { workspaceId, action: "restaurant.cash_shift.closed", entityId: shift.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toMatchObject({ managerOverride: true, openedById: staffAId, closedById: managerId });
  });

  it("records shift opening ownership and rejects unauthenticated shift actors", async () => {
    await expect(openRestaurantCashShiftSafely({ workspaceId, role: "STAFF" }, 100))
      .rejects.toThrow("Authenticated user identity is required for cash shifts.");

    const shift = await openRestaurantCashShiftSafely(staffB(), 100, "Staff B owns this shift");
    const rows = await db.$queryRaw<Array<{ openedById: string | null }>>`
      SELECT "openedById"::text AS "openedById" FROM "cash_shifts" WHERE "id"=${shift.id}::uuid
    `;
    expect(rows[0]?.openedById).toBe(staffBId);
    const openAudit = await db.auditLog.findMany({ where: { workspaceId, action: "restaurant.cash_shift.opened", entityId: shift.id } });
    expect(openAudit).toHaveLength(1);

    await closeRestaurantCashShiftFromLedger(staffB(), shift.id, 100);
  });
});
