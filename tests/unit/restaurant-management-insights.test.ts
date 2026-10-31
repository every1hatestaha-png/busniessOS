import { Prisma } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "OWNER" as "OWNER" | "MANAGER" | "STAFF",
  redirect: vi.fn((to: string): never => { throw new Error(`redirect:${to}`); }),
  listModules: vi.fn(),
  getInsights: vi.fn(),
  dbQuery: vi.fn(),
  findWorkspace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/server/auth", () => ({
  requireWorkspace: async () => ({
    workspaceId: "2002f828-dbc8-4f2a-bfec-b32f35043144",
    workspace: { name: "Isolated Restaurant" },
    role: mocks.role,
  }),
}));
vi.mock("@/lib/server/industry-modules", () => ({
  listWorkspaceModules: mocks.listModules,
  requireWorkspaceModule: vi.fn(),
}));
vi.mock("@/lib/server/restaurant-insights", () => ({
  getRestaurantManagementInsights: mocks.getInsights,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "OWNER";
  mocks.listModules.mockResolvedValue([{ moduleKey: "restaurant", enabled: true }]);
  mocks.getInsights.mockResolvedValue({
    periodDays: 7, timezone: "Asia/Karachi",
    completedOrders: 10, cancelledOrders: 2, grossSales: 15000, returns: 1500,
    netSales: 13500, discounts: 400, avgCompletedOrder: 1350,
    channels: [{ name: "DINE_IN", orders: 7, netSales: 9900 }],
    paymentMethods: [{ name: "CASH", amount: 8000, count: 5 }],
    popularItems: [{ name: "Chicken Sandwich", quantity: 9, grossValue: 3600 }],
  });
});

describe("Restaurant private management insights", () => {
  it("renders net sales, returns and explicit payment vs revenue boundaries", async () => {
    const { default: Page } = await import("@/app/(dashboard)/restaurant/manager/insights/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ period: "7" }) }));
    expect(html).toContain("Rs 13,500.00");
    expect(html).toContain("Rs 1,500.00");
    expect(html).toContain("Chicken Sandwich");
    expect(html).toContain("Payment methods");
    expect(html).toContain("not adjusted for refunds");
    expect(mocks.getInsights).toHaveBeenCalledWith("2002f828-dbc8-4f2a-bfec-b32f35043144", 7);
  });

  it("allows 30-day mode and rejects arbitrary date windows", async () => {
    const { default: Page } = await import("@/app/(dashboard)/restaurant/manager/insights/page");
    await Page({ searchParams: Promise.resolve({ period: "30" }) });
    expect(mocks.getInsights).toHaveBeenCalledWith("2002f828-dbc8-4f2a-bfec-b32f35043144", 30);
    await Page({ searchParams: Promise.resolve({ period: "500000" }) });
    expect(mocks.getInsights).toHaveBeenLastCalledWith("2002f828-dbc8-4f2a-bfec-b32f35043144", 7);
  });

  it("never fetches manager financial figures for staff", async () => {
    const { default: Page } = await import("@/app/(dashboard)/restaurant/manager/insights/page");
    mocks.role = "STAFF";
    await expect(Page({ searchParams: Promise.resolve({ period: "7" }) })).rejects.toThrow("redirect:/restaurant");
    expect(mocks.listModules).not.toHaveBeenCalled();
    expect(mocks.getInsights).not.toHaveBeenCalled();
  });
});
