import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  orders: vi.fn(),
  lines: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireWorkspace: async () => ({ workspaceId: "restaurant-fixture", role: "STAFF", workspace: { name: "Kitchen Fixture" } }),
}));
vi.mock("@/lib/server/restaurant-workspace", () => ({
  listRestaurantOrders: mock.orders,
  listRestaurantKitchenOrderLines: mock.lines,
}));
vi.mock("@/app/(dashboard)/restaurant/kitchen/kitchen-queue-refresh", () => ({
  KitchenQueueRefresh: () => null,
}));
vi.mock("@/app/(dashboard)/restaurant/mutation-form", () => ({
  RestaurantMutationForm: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));
vi.mock("@/app/(dashboard)/restaurant/v1-actions", () => ({
  transitionRestaurantOrderAction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.orders.mockResolvedValue([{
    id: "order-a", orderNumber: "R-000041", fulfillmentType: "DINE_IN",
    tableName: "Table 2", status: "CONFIRMED",
    createdAt: new Date("2026-10-25T09:00:00Z"), notes: "Allergy: peanuts",
  }]);
  mock.lines.mockResolvedValue([{
    orderId: "order-a", itemName: "Chicken pizza", quantity: 2,
    notes: "No garlic", modifiers: ["Extra cheese", "Thin crust"],
  }]);
});

describe("restaurant V2 kitchen ticket display", () => {
  it("shows per-item quantity, options and preparation notes without prices", async () => {
    const { default: Kitchen } = await import("@/app/(dashboard)/restaurant/kitchen/page");
    const html = renderToStaticMarkup(await Kitchen());
    expect(html).toContain("R-000041");
    expect(html).toContain("Chicken pizza");
    expect(html).toContain("× 2");
    expect(html).toContain("Extra cheese");
    expect(html).toContain("Thin crust");
    expect(html).toContain("No garlic");
    expect(html).toContain("Allergy: peanuts");
    expect(html).not.toContain("unitPrice");
    expect(html).not.toContain("Rs ");
    expect(mock.lines).toHaveBeenCalledWith("restaurant-fixture", ["order-a"]);
    expect(mock.orders).toHaveBeenCalledWith("restaurant-fixture", 200, {
      statuses: ["CONFIRMED", "PREPARING", "READY"], oldestFirst: true,
    });
  });

  it("renders a clear empty queue without requesting unrelated order rows", async () => {
    mock.orders.mockResolvedValue([]);
    mock.lines.mockResolvedValue([]);
    const { default: Kitchen } = await import("@/app/(dashboard)/restaurant/kitchen/page");
    const html = renderToStaticMarkup(await Kitchen());
    expect(html).toContain("Queue clear");
    expect(mock.lines).toHaveBeenCalledWith("restaurant-fixture", []);
  });
});
