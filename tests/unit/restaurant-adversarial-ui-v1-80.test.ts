import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.ComponentProps<"a">) => React.createElement("a", { href, ...props }, children) }));
vi.mock("@/app/(dashboard)/restaurant/v1-actions", () => ({
  confirmRestaurantOrderAction: vi.fn(),
  createPosOrderAction: vi.fn(),
  recordRestaurantPaymentAction: vi.fn(),
  transitionRestaurantOrderAction: vi.fn(),
  voidRestaurantPaymentAction: vi.fn(),
}));

describe("Restaurant V1.80 confirmed-finding UI regression", () => {
  it("finding 4: does not expose a writable tax override to STAFF", async () => {
    const { RestaurantPos } = await import("@/app/(dashboard)/restaurant/pos/restaurant-pos");
    const html = renderToStaticMarkup(React.createElement(RestaurantPos, {
      categories: [{ id: "category-1", name: "Meals", sortOrder: 0, isActive: true }],
      items: [{ id: "item-1", categoryId: "category-1", categoryName: "Meals", name: "Meal", description: null, price: 1000, isAvailable: true }],
      tables: [],
      canDiscount: false,
    }));
    expect(html).not.toContain('name="taxAmount"');
  });
});
