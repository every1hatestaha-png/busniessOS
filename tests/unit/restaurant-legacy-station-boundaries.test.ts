import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(),
  shiftOpen: vi.fn(), shiftClose: vi.fn(),
  ticketCreate: vi.fn(), ticketUpdate: vi.fn(),
  table: vi.fn(), recipe: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: mocks.auth }));
vi.mock("@/lib/server/restaurant-mutation-access", () => ({ assertRestaurantMutationAccess: mocks.access }));
vi.mock("@/lib/server/restaurant-cash-shifts", () => ({
  openRestaurantCashShiftSafely: mocks.shiftOpen,
  closeRestaurantCashShiftFromLedger: mocks.shiftClose,
}));
vi.mock("@/lib/server/restaurant-legacy-kot", () => ({
  updateLegacyKitchenTicketStatusSafely: mocks.ticketUpdate,
}));
vi.mock("@/lib/server/industry-modules", () => ({
  createKitchenTicket: mocks.ticketCreate,
  createRecipe: mocks.recipe,
  createRestaurantTable: mocks.table,
}));

import {
  openCashShiftAction, closeCashShiftAction,
  createKitchenTicketAction, updateKitchenTicketStatusAction,
} from "@/app/(dashboard)/restaurant/actions";

const initial = { status: "idle" as const, message: "" };
function form() {
  const f = new FormData();
  for (const [key, value] of Object.entries({
    formWorkspaceId: "workspace-a", openingCash: "50", closingCash: "50",
    shiftId: "22222222-2222-4222-8222-222222222222",
    ticketId: "33333333-3333-4333-8333-333333333333",
    ticketNumber: "KOT-SYNTHETIC", status: "PREPARING",
  })) f.set(key, value);
  return f;
}
function assign(station: string, role = "STAFF") {
  mocks.auth.mockResolvedValue({
    workspaceId: "workspace-a", vertical: "RESTAURANT",
    restaurantStation: station, role, user: { id: "staff-a" },
  });
}
describe("legacy Restaurant mutations recheck persisted station", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(undefined);
    mocks.shiftOpen.mockResolvedValue({});
    mocks.shiftClose.mockResolvedValue({ expectedCash: 50, variance: 0 });
    mocks.ticketCreate.mockResolvedValue({});
    mocks.ticketUpdate.mockResolvedValue({});
  });

  it("denies kitchen STAFF cash-shift opening and closing before database access", async () => {
    assign("KITCHEN");
    const open = await openCashShiftAction(initial, form());
    const close = await closeCashShiftAction(initial, form());
    expect(open.status).toBe("error");
    expect(close.status).toBe("error");
    expect(open.message).toMatch(/Sales station/);
    expect(close.message).toMatch(/Sales station/);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.shiftOpen).not.toHaveBeenCalled();
    expect(mocks.shiftClose).not.toHaveBeenCalled();
  });

  it("denies cashier STAFF legacy KOT creation and status mutation", async () => {
    assign("POS");
    const created = await createKitchenTicketAction(initial, form());
    const changed = await updateKitchenTicketStatusAction(initial, form());
    expect(created.status).toBe("error");
    expect(changed.status).toBe("error");
    expect(created.message).toMatch(/Kitchen station/);
    expect(changed.message).toMatch(/Kitchen station/);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.ticketCreate).not.toHaveBeenCalled();
    expect(mocks.ticketUpdate).not.toHaveBeenCalled();
  });

  it("permits matching station workflows with subscription check", async () => {
    assign("POS");
    expect((await openCashShiftAction(initial, form())).status).toBe("success");
    expect((await closeCashShiftAction(initial, form())).status).toBe("success");
    expect(mocks.shiftOpen).toHaveBeenCalledTimes(1);
    expect(mocks.shiftClose).toHaveBeenCalledTimes(1);

    assign("KITCHEN");
    expect((await createKitchenTicketAction(initial, form())).status).toBe("success");
    expect((await updateKitchenTicketStatusAction(initial, form())).status).toBe("success");
    expect(mocks.ticketCreate).toHaveBeenCalledTimes(1);
    expect(mocks.ticketUpdate).toHaveBeenCalledTimes(1);
  });

  it("rechecks a downgraded station on every action, including stale tabs", async () => {
    assign("POS");
    expect((await openCashShiftAction(initial, form())).status).toBe("success");
    assign("KITCHEN");
    expect((await openCashShiftAction(initial, form())).status).toBe("error");
    expect(mocks.shiftOpen).toHaveBeenCalledTimes(1);
  });

  it("preserves managers and legacy ALL staff until the owner restricts their station", async () => {
    assign("ALL");
    expect((await openCashShiftAction(initial, form())).status).toBe("success");
    expect((await createKitchenTicketAction(initial, form())).status).toBe("success");
    assign("ALL", "MANAGER");
    expect((await closeCashShiftAction(initial, form())).status).toBe("success");
    expect((await updateKitchenTicketStatusAction(initial, form())).status).toBe("success");
  });

  it("propagates auth removal rather than writing after a deleted membership", async () => {
    mocks.auth.mockRejectedValue(new Error("MEMBERSHIP_REMOVED"));
    await expect(openCashShiftAction(initial, form())).rejects.toThrow("MEMBERSHIP_REMOVED");
    expect(mocks.shiftOpen).not.toHaveBeenCalled();
  });
});
