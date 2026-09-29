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
      .rejects.toThrow("Restaurant cash shift opener must be a member of the same workspace");

    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid AND "status"='OPEN'
    `;
    expect(rows[0]?.count).toBe(0);
  });

  it("blocks a STAFF member who forges MANAGER role from closing another cashier's shift", async () => {
    const shift = await openRestaurantCashShiftSafely(staffA(), 250, "Staff A owns this drawer");

    await expect(closeRestaurantCashShiftFromLedger(forgedManager(), shift.id, 250, "Forged manager close"))
      .rejects.toThrow("Only a manager can close another user's restaurant cash shift");

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