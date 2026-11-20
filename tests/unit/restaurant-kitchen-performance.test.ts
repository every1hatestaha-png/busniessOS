import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "OWNER", modules: vi.fn(), performance: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: async () => ({
  workspaceId: "synthetic-restaurant", role: mocks.role, workspace: { name: "QA Restaurant" },
}) }));
vi.mock("@/lib/server/industry-modules", () => ({ listWorkspaceModules: mocks.modules }));
vi.mock("@/lib/server/restaurant-kitchen-performance", () => ({
  getRestaurantKitchenPerformance: mocks.performance,
}));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => { throw Error("redirect:" + destination); },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "OWNER";
  mocks.modules.mockResolvedValue([{ moduleKey: "restaurant", enabled: true }]);
  mocks.performance.mockResolvedValue({
    days: 7, prepared: 12, meanMinutes: 13.5, p90Minutes: 22.1, delayed20: 3,
    waiting: 4, preparing: 3, ready: 2, waitingOver10: 1, preparingOver20: 2,
    byDay: [{ day: "2026-11-01", prepared: 12, meanMinutes: 13.5 }],
  });
});
describe("Kitchen performance access", () => {
  it("shows measured KOT durations to a manager", async () => {
    const Page = (await import("@/app/(dashboard)/restaurant/manager/kitchen-performance/page")).default;
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ period: "7" }) }));
    expect(html).toContain("13.5 min");
    expect(html).toContain("22.1 min");
    expect(mocks.performance).toHaveBeenCalledWith("synthetic-restaurant", 7);
  });
  it("denies staff before loading private manager data", async () => {
    mocks.role = "STAFF";
    const Page = (await import("@/app/(dashboard)/restaurant/manager/kitchen-performance/page")).default;
    await expect(Page({ searchParams: Promise.resolve({ period: "30" }) })).rejects.toThrow("redirect:/restaurant");
    expect(mocks.performance).not.toHaveBeenCalled();
  });
});
