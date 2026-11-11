import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  orders: vi.fn(),
  lines: vi.fn(),
  instructionUpdates: vi.fn(),
  timezone: "Asia/Karachi",
}));

vi.mock("@/lib/server/auth", () => ({
  requireWorkspace: async () => ({ workspaceId: "restaurant-fixture", role: "STAFF", user: { id: "kitchen-fixture" }, workspace: { name: "Kitchen Fixture", timezone: mock.timezone } }),
}));
vi.mock("@/lib/server/restaurant-stations", () => ({ assertRestaurantStation: vi.fn() }));
vi.mock("@/lib/server/restaurant-kitchen-instruction-alerts", () => ({
  listKitchenInstructionUpdateTimes: mock.instructionUpdates,
}));
vi.mock("@/lib/server/restaurant-workspace", () => ({
  listRestaurantKitchenOrderLines: mock.lines,
}));
vi.mock("@/lib/server/restaurant-kitchen-orders", () => ({ listKitchenOrders: mock.orders }));
vi.mock("@/app/(dashboard)/restaurant/kitchen/kitchen-queue-refresh", () => ({
  KitchenQueueRefresh: () => null,
}));
vi.mock("@/app/(dashboard)/restaurant/mutation-form", () => ({
  RestaurantMutationForm: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));
vi.mock("@/app/(dashboard)/restaurant/v1-actions", () => ({
  transitionKitchenOrderAction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.timezone = "Asia/Karachi";
  mock.orders.mockImplementation(async (_workspaceId: string, stage: string) => {
    if (stage !== "CONFIRMED") return [];
    return [{
      id: "order-a", orderNumber: "R-000041", fulfillmentType: "DINE_IN",
      tableName: "Table 2", status: "CONFIRMED",
      createdAt: new Date("2026-10-25T09:00:00Z"), notes: "Allergy: peanuts",
    }];
  });
  mock.instructionUpdates.mockResolvedValue(new Map());
  mock.lines.mockResolvedValue([{
    orderId: "order-a", itemName: "Chicken pizza", categoryName: "Main course", quantity: 2,
    notes: "No garlic", modifiers: ["Extra cheese", "Thin crust"],
  }]);
});

describe("restaurant V2 kitchen ticket display", () => {
  it("shows per-item quantity, options and preparation notes without prices", async () => {
    const { default: Kitchen } = await import("@/app/(dashboard)/restaurant/kitchen/page");
    const html = renderToStaticMarkup(await Kitchen());
    expect(html).toContain("R-000041");
    expect(html).toContain("Chicken pizza");
    expect(html).toContain("Main course");
    expect(html).toContain("× 2");
    expect(html).toContain("Extra cheese");
    expect(html).toContain("Thin crust");
    expect(html).toContain("No garlic");
    expect(html).not.toContain("Serve order");
    expect(html).not.toContain("Cancel");
    expect(html).toContain("Allergy: peanuts");
    expect(html).not.toContain("unitPrice");
    expect(html).not.toContain("Rs ");
    expect(mock.lines).toHaveBeenCalledWith("restaurant-fixture", ["order-a"]);
    for (const status of ["CONFIRMED", "PREPARING", "READY"]) {
      expect(mock.orders).toHaveBeenCalledWith("restaurant-fixture", status, 75);
    }
    expect(mock.orders).toHaveBeenCalledTimes(3);
    expect(html).not.toContain("Open cashier order board");
  });


  it("makes manager-corrected kitchen instructions visible without prices", async () => {
    mock.instructionUpdates.mockResolvedValue(new Map([[
      "order-a", new Date("2026-10-25T09:04:00Z"),
    ]]));
    const { default: Kitchen } = await import("@/app/(dashboard)/restaurant/kitchen/page");
    const html = renderToStaticMarkup(await Kitchen());
    expect(html).toContain("Kitchen instructions updated");
    expect(html).toContain("Manager correction");
    expect(html).toContain("Allergy: peanuts");
    expect(html).not.toContain("Rs ");
    expect(mock.instructionUpdates).toHaveBeenCalledWith("restaurant-fixture", ["order-a"]);
  });

  it("renders ticket and manager correction times when a legacy timezone is invalid", async () => {
    mock.timezone = "Invalid/Legacy_Zone";
    mock.instructionUpdates.mockResolvedValue(new Map([[
      "order-a", new Date("2026-10-25T09:04:00Z"),
    ]]));
    const { default: Kitchen } = await import("@/app/(dashboard)/restaurant/kitchen/page");
    const html = renderToStaticMarkup(await Kitchen());
    expect(html).toContain("R-000041");
    expect(html).toContain("Kitchen instructions updated");
    expect(html).toContain("2:00 pm");
    expect(html).toContain("2:04 pm");
    expect(html).not.toContain("Rs ");
  });

  it("never starves new confirmed orders behind a full ready-ticket backlog", async () => {
    const ready = Array.from({ length: 75 }, (_, i) => ({
      id: `ready-${i}`, orderNumber: `R-READY-${i}`, fulfillmentType: "TAKEAWAY",
      tableName: null, status: "READY", createdAt: new Date("2026-10-25T08:00:00Z"),
      notes: null,
    }));
    mock.orders.mockImplementation(async (_wid: string, stage: string) =>
      stage === "CONFIRMED" ? [{
        id: "new-order", orderNumber: "R-NEW-001", fulfillmentType: "TAKEAWAY", tableName: null,
        status: "CONFIRMED", createdAt: new Date("2026-10-25T09:00:00Z"), notes: null,
      }] : stage === "READY" ? ready : []);
    mock.lines.mockResolvedValue([]);
    const { default: Kitchen } = await import("@/app/(dashboard)/restaurant/kitchen/page");
    const html = renderToStaticMarkup(await Kitchen());
    expect(html).toContain("R-NEW-001");
    expect(html).toContain("R-READY-0");
    expect(html).toContain("75+");
    expect(html).toContain("75+ orders");
    expect(html).toContain("Showing the oldest first");
    expect(mock.lines).toHaveBeenCalledWith("restaurant-fixture",
      expect.arrayContaining(["new-order", "ready-0"]));
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
