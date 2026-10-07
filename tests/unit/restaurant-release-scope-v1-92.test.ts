import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ requireWorkspace: async () => ({ workspaceId: "saved-review-workspace", role: "OWNER", workspace: { name: "Synthetic Restaurant" } }) }));
vi.mock("@/lib/server/products", () => ({ listProducts: async () => [] }));
vi.mock("@/lib/server/sales", () => ({ listSales: async () => [] }));
vi.mock("@/lib/server/accounting", () => ({ getCashBankAccounts: async () => [] }));
vi.mock("@/lib/server/restaurant-integrity", () => ({ listRestaurantPayments: async () => [] }));
vi.mock("@/lib/server/restaurant-payment-summary", () => ({ listRestaurantNetPaymentSummaries: async () => [] }));
vi.mock("@/app/(dashboard)/restaurant/restaurant-controls", () => ({ RestaurantControls: () => null }));
vi.mock("@/app/(dashboard)/restaurant/restaurant-lifecycle-controls", () => ({ RestaurantLifecycleControls: () => null }));
vi.mock("@/app/(dashboard)/restaurant/v1-actions", () => ({ confirmRestaurantOrderAction: vi.fn(), recordRestaurantPaymentAction: vi.fn(), transitionRestaurantOrderAction: vi.fn(), voidRestaurantPaymentAction: vi.fn() }));
vi.mock("@/lib/server/industry-modules", () => ({
  listWorkspaceModules: async () => [{ moduleKey: "restaurant", enabled: true }],
  getIndustryHealth: async () => ({ restaurant: { tables: 0, recipes: 0, openKitchenTickets: 0 } }),
  getRestaurantOverviewReadiness: async () => ({ recipes: 0, activeRecipes: 0, openKitchenTickets: 0, openShift: null }),
  listCashShifts: async () => [], listKitchenTickets: async () => [], listRestaurantRecipes: async () => [], listRestaurantTables: async () => [],
}));
vi.mock("@/lib/server/restaurant-workspace", () => ({
  getRestaurantWorkspaceMetrics: async () => ({ todaySales: 0, todayOrders: 0, liveOrders: 0, pendingWhatsapp: 0, readyOrders: 0 }),
  listRestaurantOrders: async () => [],
  listWhatsappRestaurantMessages: async () => [{ id: "saved-message", customerName: "Historical customer", body: "Saved meal request", receivedAt: new Date("2026-01-01T00:00:00Z"), restaurantOrderId: null }],
}));

describe("Restaurant launch scope in rendered customer pages", () => {
  it("makes automatic intake unavailable while retaining saved message history", async () => {
    const { default: Page } = await import("@/app/(dashboard)/restaurant/whatsapp/page");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Automatic WhatsApp intake is unavailable");
    expect(html).toContain("does not receive new WhatsApp messages");
    expect(html).toContain("Historical customer");
    expect(html).toContain("Saved meal request");
    expect(html).not.toMatch(/Safe intake boundary is ready|must be connected separately before live intake/);
  });

  it("labels the dashboard entry as saved reviews without promising intake", async () => {
    const { default: Page } = await import("@/app/(dashboard)/restaurant/page");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Saved WhatsApp reviews");
    expect(html).not.toMatch(/WhatsApp intake|Pending intake and provider messages/);
  });

  it("describes the order board as POS plus saved staff reviews", async () => {
    const { default: Page } = await import("@/app/(dashboard)/restaurant/orders/page");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Saved WhatsApp reviews");
    expect(html).toContain("POS orders and saved staff reviews");
    expect(html).not.toContain("One operational queue for POS and WhatsApp orders");
  });
});
