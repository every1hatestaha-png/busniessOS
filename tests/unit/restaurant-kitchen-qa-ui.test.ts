import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ role: "OWNER", station: "KITCHEN", empty: false }));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: async () => ({ workspaceId: "qa-workspace", workspace: { name: "QA Restaurant" }, role: fixture.role, restaurantStation: fixture.station }) }));
vi.mock("@/lib/server/restaurant-kitchen-queue", () => ({ listRestaurantKitchenQueue: async (workspace: string) => {
  expect(workspace).toBe("qa-workspace");
  return { cappedStatuses: [], orders: [
    { id: "order-a", orderNumber: "R-A", status: "CONFIRMED", fulfillmentType: "DINE_IN", tableName: "QA A", createdAt: new Date("2026-10-11T10:00:00Z"), notes: "" },
    { id: "order-b", orderNumber: "R-B", status: "READY", fulfillmentType: "TAKEAWAY", tableName: null, createdAt: new Date("2026-10-11T10:00:00Z"), notes: "" },
  ], kitchenItems: new Map([
    ["order-a", fixture.empty ? [] : [{ itemName: "QA Burger", quantity: 2, notes: "No onion", modifiers: ["Extra cheese"] }]],
    ["order-b", [{ itemName: "QA Wrap", quantity: 1, notes: "<script>alert(1)</script>", modifiers: [] }]],
  ]) };
} }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/app/(dashboard)/restaurant/kitchen/kitchen-auto-refresh", () => ({ KitchenAutoRefresh: () => null }));
vi.mock("@/app/(dashboard)/restaurant/v1-actions", () => ({ transitionRestaurantOrderAction: vi.fn() }));
vi.mock("@/app/(dashboard)/restaurant/mutation-form", () => ({ RestaurantMutationForm: ({ children }: { children: React.ReactNode }) => React.createElement("form", {}, children) }));

async function render() {
  const { default: Page } = await import("@/app/(dashboard)/restaurant/kitchen/page");
  return renderToStaticMarkup(await Page());
}
describe("Kitchen dish quantity QA regressions", () => {
  beforeEach(() => { fixture.role = "OWNER"; fixture.empty = false; });
  it("renders quantities, dish names, modifiers and notes in their own order card", async () => {
    const html = await render();
    const dishesA = html.split('aria-label="Dishes for R-A"')[1].split('Print kitchen ticket')[0];
    const dishesB = html.split('aria-label="Dishes for R-B"')[1].split('Print kitchen ticket')[0];
    expect(dishesA).toMatch(/>2×<.*QA Burger/s);
    expect(dishesA).toContain("Extra cheese"); expect(dishesA).toContain("No onion");
    expect(dishesA).not.toContain("QA Wrap");
    expect(dishesB).toMatch(/>1×<.*QA Wrap/s); expect(dishesB).not.toContain("QA Burger");
    expect(dishesB).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  });
  it("retains kitchen STAFF preparation but hides completion and cancellation controls", async () => {
    fixture.role = "STAFF";
    const html = await render();
    expect(html).toContain("Start preparing"); expect(html).toContain("A manager will complete the order.");
    expect(html).not.toContain('value="COMPLETED"'); expect(html).not.toContain('value="CANCELLED"');
    expect(html).not.toContain("Serve order");
  });
  it("provides an explicit safe fallback instead of silently empty dishes", async () => {
    fixture.empty = true;
    expect(await render()).toContain("No dish lines found. Check the printed kitchen ticket.");
  });
});
