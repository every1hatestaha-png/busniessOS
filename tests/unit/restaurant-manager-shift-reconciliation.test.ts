import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "OWNER" as "OWNER" | "MANAGER" | "STAFF",
  timezone: "Asia/Karachi",
  listCashShifts: vi.fn(),
  listModules: vi.fn(),
  listReviews: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/server/auth", () => ({
  requireWorkspace: async () => ({
    workspaceId: "synthetic-restaurant",
    role: mocks.role,
    workspace: { name: "Synthetic Restaurant", timezone: mocks.timezone },
  }),
}));
vi.mock("@/app/(dashboard)/restaurant/mutation-form", () => ({ RestaurantMutationForm: () => null }));
vi.mock("@/lib/server/restaurant-shift-review", () => ({ listRestaurantCashVarianceReviews: mocks.listReviews }));
vi.mock("@/lib/server/industry-modules", () => ({
  listWorkspaceModules: mocks.listModules,
  listCashShifts: mocks.listCashShifts,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "OWNER";
  mocks.timezone = "Asia/Karachi";
  mocks.listModules.mockResolvedValue([{ moduleKey: "restaurant", enabled: true }]);
  mocks.listReviews.mockResolvedValue(new Set());
  mocks.listCashShifts.mockResolvedValue([
    {
      id: "shift-a", status: "CLOSED", openingCash: 1000, expectedCash: 1400,
      closingCash: 1300, variance: -100, openedAt: new Date("2026-11-01T07:00:00Z"),
      closedAt: new Date("2026-11-01T10:00:00Z"),
    },
    {
      id: "shift-b", status: "CLOSED", openingCash: 200, expectedCash: 200,
      closingCash: 200, variance: 0, openedAt: new Date("2026-11-01T03:00:00Z"),
      closedAt: new Date("2026-11-01T06:00:00Z"),
    },
  ]);
});

describe("Manager-only cash reconciliation", () => {
  it("shows immutable shift settlement variance to managers", async () => {
    const { default: Page } = await import("@/app/(dashboard)/restaurant/manager/shifts/page");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Cash shift reconciliation");
    expect(html).toContain("Cash short");
    expect(html).toContain("Balanced");
    expect(html).toContain("Rs 1,400.00");
    expect(html).toContain("Rs -100.00");
    expect(mocks.listCashShifts).toHaveBeenCalledWith("synthetic-restaurant");
    expect(mocks.listReviews).toHaveBeenCalledWith("synthetic-restaurant", ["shift-a"]);
  });

  it("renders manager shift history with the safe fallback for an invalid legacy timezone", async () => {
    mocks.timezone = "Invalid/Legacy_Zone";
    const { default: Page } = await import("@/app/(dashboard)/restaurant/manager/shifts/page");
    const invalidTimezoneHtml = renderToStaticMarkup(await Page());
    mocks.timezone = "Asia/Karachi";
    const fallbackHtml = renderToStaticMarkup(await Page());
    expect(invalidTimezoneHtml).toEqual(fallbackHtml);
    expect(invalidTimezoneHtml).toContain("Cash shift reconciliation");
  });

  it("denies staff before reading financial history", async () => {
    mocks.role = "STAFF";
    const { default: Page } = await import("@/app/(dashboard)/restaurant/manager/shifts/page");
    await expect(Page()).rejects.toThrow("redirect:/restaurant");
    expect(mocks.listCashShifts).not.toHaveBeenCalled();
    expect(mocks.listReviews).not.toHaveBeenCalled();
    expect(mocks.listModules).not.toHaveBeenCalled();
  });
});
