import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "OWNER" as "OWNER" | "ADMIN" | "MANAGER" | "STAFF",
  station: "CASHIER" as "CASHIER" | "KITCHEN" | null,
  getOverviewReadiness: vi.fn(),
  listTables: vi.fn(),
  getMetrics: vi.fn(),
  listOrders: vi.fn(),
  listModules: vi.fn(),
  listStaff: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/restaurant/station-auto-refresh", () => ({
  RestaurantStationAutoRefresh: () => null,
}));
vi.mock("@/lib/server/auth", () => ({
  requireWorkspace: async () => ({ workspaceId: "synthetic-restaurant", role: mocks.role, user: { id: "fixture-user" }, workspace: { name: "Synthetic Restaurant" } }),
}));
vi.mock("@/lib/server/restaurant-stations", () => ({
  getRestaurantActorStation: async () => mocks.station,
  listRestaurantStationStaff: mocks.listStaff,
}));
vi.mock("@/app/(dashboard)/restaurant/restaurant-controls", () => ({ RestaurantControls: () => null }));
vi.mock("@/app/(dashboard)/restaurant/manager/staff/actions", () => ({ assignRestaurantStaffStationAction: vi.fn() }));
vi.mock("@/app/(dashboard)/restaurant/mutation-form", () => ({
  RestaurantMutationForm: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/server/industry-modules", () => ({
  listWorkspaceModules: mocks.listModules,
  getRestaurantOverviewReadiness: mocks.getOverviewReadiness,
  listRestaurantTables: mocks.listTables,
}));
vi.mock("@/lib/server/restaurant-workspace", () => ({
  getRestaurantWorkspaceMetrics: mocks.getMetrics,
  listRestaurantOrders: mocks.listOrders,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "OWNER";
  mocks.station = "CASHIER";
  mocks.listModules.mockResolvedValue([{ moduleKey: "restaurant", enabled: true }]);
  mocks.listStaff.mockResolvedValue([{ userId: "staff-a", email: "unassigned@example.invalid", station: null }]);
  mocks.listTables.mockResolvedValue([]);
  mocks.getOverviewReadiness.mockResolvedValue({ recipes: 0, activeRecipes: 0, openKitchenTickets: 0, openShift: null });
  mocks.getMetrics.mockResolvedValue({ todaySales: 12_500, todayOrders: 8, liveOrders: 2, readyOrders: 1, pendingWhatsapp: 0 });
  mocks.listOrders.mockResolvedValue([]);
});

describe("Restaurant V2 station boundaries", () => {
  it("offers cashier staff only the cashier station and no manager metrics", async () => {
    mocks.role = "STAFF";
    const { default: Stations } = await import("@/app/(dashboard)/restaurant/page");
    const html = renderToStaticMarkup(await Stations());
    expect(html).toContain('href="/restaurant/pos"');
    expect(html).not.toContain('href="/restaurant/kitchen"');
    expect(html).not.toContain('href="/restaurant/manager"');
    expect(html).not.toContain("12,500");
    expect(mocks.getMetrics).not.toHaveBeenCalled();
  });

  it("offers kitchen staff only kitchen station", async () => {
    mocks.role = "STAFF";
    mocks.station = "KITCHEN";
    const { default: Stations } = await import("@/app/(dashboard)/restaurant/page");
    const html = renderToStaticMarkup(await Stations());
    expect(html).toContain('href="/restaurant/kitchen"');
    expect(html).not.toContain('href="/restaurant/pos"');
    expect(html).not.toContain('href="/restaurant/manager"');
  });

  it("offers a manager station to an authorized owner", async () => {
    const { default: Stations } = await import("@/app/(dashboard)/restaurant/page");
    const html = renderToStaticMarkup(await Stations());
    expect(html).toContain('href="/restaurant/manager"');
    expect(html).toContain("Cashier");
    expect(html).toContain("Kitchen");
    expect(mocks.getMetrics).not.toHaveBeenCalled();
  });

  it("denies a direct manager URL for STAFF before any financial read", async () => {
    mocks.role = "STAFF";
    const { default: Manager } = await import("@/app/(dashboard)/restaurant/manager/page");
    await expect(Manager()).rejects.toThrow("redirect:/restaurant");
    expect(mocks.getOverviewReadiness).not.toHaveBeenCalled();
    expect(mocks.getMetrics).not.toHaveBeenCalled();
    expect(mocks.listOrders).not.toHaveBeenCalled();
  });

  it("rejects direct STAFF visits to the manager-only station assignment screen", async () => {
    mocks.role = "STAFF";
    const { default: Staff } = await import("@/app/(dashboard)/restaurant/manager/staff/page");
    await expect(Staff()).rejects.toThrow("redirect:/restaurant");
    expect(mocks.listStaff).not.toHaveBeenCalled();
    expect(mocks.listModules).not.toHaveBeenCalled();
  });

  it("shows existing station assignments only to managers", async () => {
    mocks.role = "MANAGER";
    mocks.listStaff.mockResolvedValue([
      { userId: "cash-a", email: "cashier@example.invalid", station: "CASHIER" },
      { userId: "kitchen-a", email: "kitchen@example.invalid", station: "KITCHEN" },
      { userId: "unassigned-a", email: "unassigned@example.invalid", station: null },
    ]);
    const { default: Staff } = await import("@/app/(dashboard)/restaurant/manager/staff/page");
    const html = renderToStaticMarkup(await Staff());
    expect(html).toContain("cashier@example.invalid");
    expect(html).toContain("kitchen@example.invalid");
    expect(html).toContain("unassigned@example.invalid");
    expect(html).toContain("No access");
    expect(html).toContain("Cashier");
    expect(html).toContain("Kitchen");
    expect(mocks.listStaff).toHaveBeenCalledWith("synthetic-restaurant");
  });

  it("renders server-approved manager metrics and saved-review labeling", async () => {
    mocks.role = "MANAGER";
    const { default: Manager } = await import("@/app/(dashboard)/restaurant/manager/page");
    const html = renderToStaticMarkup(await Manager());
    expect(html).toContain("Today&#x27;s sales");
    expect(html).toContain("12,500");
    expect(html).toContain("Saved WhatsApp reviews");
    expect(mocks.getMetrics).toHaveBeenCalledWith("synthetic-restaurant");
    expect(html).toContain("Staff station readiness");
    expect(html).toContain("Unassigned");
    expect(html).toContain("Assign or explicitly revoke");
    for (const status of ["CONFIRMED", "PREPARING", "READY"]) {
      expect(mocks.listOrders).toHaveBeenCalledWith("synthetic-restaurant", 15, { statuses: [status], oldestFirst: true });
    }
    expect(mocks.listOrders).toHaveBeenCalledTimes(3);
  });
});
