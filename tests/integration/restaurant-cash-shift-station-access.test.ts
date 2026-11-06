import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/server/auth", () => auth);
vi.mock("@/lib/server/restaurant-mutation-access", () => ({
  assertRestaurantMutationAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let db: typeof import("@/lib/server/db")["db"];
let workspaceId = "";
let managerId = "";
let cashierId = "";
let kitchenId = "";

const runId = randomUUID();
const actor = (role: "MANAGER" | "STAFF", userId: string) => ({
  workspaceId, role, user: { id: userId },
});

function actionForm(values: Record<string, string>) {
  const form = new FormData();
  form.set("formWorkspaceId", workspaceId);
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("Restaurant cash-shift server actions respect station isolation", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    const [manager, cashier, kitchen] = await Promise.all([
      db.user.create({ data: { clerkId: `cash-shift-manager-${runId}`, email: `cash-shift-manager-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `cash-shift-cashier-${runId}`, email: `cash-shift-cashier-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `cash-shift-kitchen-${runId}`, email: `cash-shift-kitchen-${runId}@example.invalid` } }),
    ]);
    managerId = manager.id;
    cashierId = cashier.id;
    kitchenId = kitchen.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Cash shift station isolation ${runId}`,
        vertical: "LEGACY",
        members: {
          create: [
            { userId: managerId, role: "MANAGER" },
            { userId: cashierId, role: "STAFF" },
            { userId: kitchenId, role: "STAFF" },
          ],
        },
      },
    });
    workspaceId = workspace.id;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspaceId}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;

    const { setRestaurantStaffStation } = await import("@/lib/server/restaurant-stations");
    await setRestaurantStaffStation(
      { workspaceId, role: "MANAGER", userId: managerId }, cashierId, "CASHIER",
    );
    await setRestaurantStaffStation(
      { workspaceId, role: "MANAGER", userId: managerId }, kitchenId, "KITCHEN",
    );
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "restaurant_staff_stations" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.$executeRaw`DELETE FROM "workspace_modules" WHERE "workspaceId"=${workspaceId}::uuid`;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [managerId, cashierId, kitchenId] } } });
    await db.$disconnect();
  }, 60_000);

  it("allows an assigned Cashier to open and close their own shift", async () => {
    auth.requireWorkspace.mockResolvedValue(actor("STAFF", cashierId));
    const { openCashShiftAction, closeCashShiftAction } = await import("@/app/(dashboard)/restaurant/actions");
    const opened = await openCashShiftAction(
      { status: "idle", message: "" },
      actionForm({ openingCash: "250", notes: "Cashier opening count" }),
    );
    expect(opened.status).toBe("success");

    const shifts = await db.$queryRaw<Array<{ id: string; status: string; openedById: string }>>`
      SELECT "id"::text AS "id", "status", "openedById"::text AS "openedById"
      FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid
    `;
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({ status: "OPEN", openedById: cashierId });

    const closed = await closeCashShiftAction(
      { status: "idle", message: "" },
      actionForm({ shiftId: shifts[0]!.id, closingCash: "250", notes: "Cashier closing count" }),
    );
    expect(closed.status).toBe("success");
    const [persisted] = await db.$queryRaw<Array<{ status: string; closedById: string | null }>>`
      SELECT "status", "closedById"::text AS "closedById"
      FROM "cash_shifts" WHERE "id"=${shifts[0]!.id}::uuid
    `;
    expect(persisted).toMatchObject({ status: "CLOSED", closedById: cashierId });
  });

  it("denies Kitchen access to both opening and closing cash shifts", async () => {
    auth.requireWorkspace.mockResolvedValue(actor("STAFF", kitchenId));
    const { openCashShiftAction, closeCashShiftAction } = await import("@/app/(dashboard)/restaurant/actions");
    const beforeRows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid
    `;
    const before = beforeRows[0]!.count;

    const opened = await openCashShiftAction(
      { status: "idle", message: "" },
      actionForm({ openingCash: "100" }),
    );
    expect(opened.status).toBe("error");
    const afterRows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "cash_shifts" WHERE "workspaceId"=${workspaceId}::uuid
    `;
    expect(afterRows[0]!.count).toBe(before);

    auth.requireWorkspace.mockResolvedValue(actor("STAFF", cashierId));
    const valid = await openCashShiftAction(
      { status: "idle", message: "" },
      actionForm({ openingCash: "100" }),
    );
    expect(valid.status).toBe("success");
    const [shift] = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "cash_shifts"
      WHERE "workspaceId"=${workspaceId}::uuid AND "status"='OPEN'
    `;
    auth.requireWorkspace.mockResolvedValue(actor("STAFF", kitchenId));
    const closed = await closeCashShiftAction(
      { status: "idle", message: "" },
      actionForm({ shiftId: shift!.id, closingCash: "100" }),
    );
    expect(closed.status).toBe("error");
    const [stillOpen] = await db.$queryRaw<Array<{ status: string; closedById: string | null }>>`
      SELECT "status", "closedById"::text AS "closedById"
      FROM "cash_shifts" WHERE "id"=${shift!.id}::uuid
    `;
    expect(stillOpen).toMatchObject({ status: "OPEN", closedById: null });
  });
});
