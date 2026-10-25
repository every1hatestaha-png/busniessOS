import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "OWNER" as "OWNER" | "ADMIN" | "MANAGER" | "STAFF",
  getOverviewReadiness: vi.fn(),
  listTables: vi.fn(),
  getMetrics: vi.fn(),
  listOrders: vi.fn(),
  listModules: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/server/auth", () => ({
  requireWorkspace: async () => ({ workspaceId: "synthetic-restaurant", role: mocks.role, workspace: { name: "Synthetic Restaurant" } }),
}));
vi.mock("@/app/(dashboard)/restaurant/restaurant-controls", () => ({ RestaurantControls: () => null }));
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
  mocks.listModules.mockResolvedValue([{ moduleKey: "restaurant", enabled: true }]);
  mocks.listTables.mockResolvedValue([]);
  mocks.getOverviewReadiness.mockResolvedValue({ recipes: 0, activeRecipes: 0, openKitchenTickets: 0, openShift: null });
  mocks.getMetrics.mockResolvedValue({ todaySales: 12_500, todayOrders: 8, liveOrders: 2, readyOrders: 1, pendingWhatsapp: 0 });
  mocks.listOrders.mockResolvedValue([]);
});

describe("Restaurant V2 station boundaries", () => {
  it("offers staff cashier/kitchen stations without financial manager details", async () => {
    mocks.role = "STAFF";
    const { default: Stations } = await import("@/app/(dashboard)/restaurant/page");
    const html = renderToStaticMarkup(await Stations());
    expect(html).toContain("Cashier");
    expect(html).toContain("Kitchen");
    expect(html).not.toContain('href="/restaurant/manager"');
    expect(html).not.toContain("12,500");
    expect(mocks.getMetrics).not.toHaveBeenCalled();
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

  it("renders server-approved manager metrics and saved-review labeling", async () => {
    mocks.role = "MANAGER";
    const { default: Manager } = await import("@/app/(dashboard)/restaurant/manager/page");
    const html = renderToStaticMarkup(await Manager());
    expect(html).toContain("Today's sales");
    expect(html).toContain("12,500");
    expect(html).toContain("Saved WhatsApp reviews");
    expect(mocks.getMetrics).toHaveBeenCalledWith("synthetic-restaurant");
  });
});
