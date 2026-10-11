import { describe, expect, it } from "vitest";

import {
  canOpenRestaurantStationPath, canPerformRestaurantStationAction, restaurantStationHome,
} from "@/lib/restaurant/station-access";

const role = "STAFF" as const;
const vertical = "RESTAURANT" as const;
const print = "/restaurant/orders/12345678-1234-4234-8234-123456789abc/print";

describe("Restaurant staff station boundaries", () => {
  it("restricts a cashier to POS, order board and scoped receipt page", () => {
    for (const path of ["/restaurant/pos", "/restaurant/orders", print]) {
      expect(canOpenRestaurantStationPath(role, vertical, "POS", path)).toBe(true);
    }
    for (const path of ["/restaurant", "/restaurant/kitchen", "/restaurant/menu",
      "/settings", "/reports", "/api/v1/sales", "/restaurant/orders/123/return", null]) {
      expect(canOpenRestaurantStationPath(role, vertical, "POS", path)).toBe(false);
    }
  });

  it("restricts a kitchen worker to KDS and scoped kitchen print", () => {
    for (const path of ["/restaurant/kitchen", print]) {
      expect(canOpenRestaurantStationPath(role, vertical, "KITCHEN", path)).toBe(true);
    }
    for (const path of ["/restaurant/orders", "/restaurant/pos", "/restaurant/menu",
      "/settings", "/sales", "/api/v1/products", "/restaurant/orders/123/return", null]) {
      expect(canOpenRestaurantStationPath(role, vertical, "KITCHEN", path)).toBe(false);
    }
  });

  it("does not let kitchen workers create or collect sales, or cashiers change kitchen preparation", () => {
    expect(canPerformRestaurantStationAction(role, vertical, "KITCHEN", "POS")).toBe(false);
    expect(canPerformRestaurantStationAction(role, vertical, "KITCHEN", "KITCHEN")).toBe(true);
    expect(canPerformRestaurantStationAction(role, vertical, "POS", "POS")).toBe(true);
    expect(canPerformRestaurantStationAction(role, vertical, "POS", "KITCHEN")).toBe(false);
  });

  it("preserves legacy staff access and manager access, but denies unknown stations", () => {
    expect(canOpenRestaurantStationPath(role, vertical, "ALL", "/settings")).toBe(true);
    expect(canOpenRestaurantStationPath("OWNER", vertical, "KITCHEN", "/settings")).toBe(true);
    expect(canOpenRestaurantStationPath(role, vertical, "BROKEN", "/restaurant/kitchen")).toBe(false);
    expect(canPerformRestaurantStationAction(role, vertical, "BROKEN", "POS")).toBe(false);
    expect(restaurantStationHome("KITCHEN")).toBe("/restaurant/kitchen");
    expect(restaurantStationHome("POS")).toBe("/restaurant/pos");
  });

  it("preserves non-Restaurant STAFF behavior", () => {
    expect(canOpenRestaurantStationPath(role, "TRADING", "KITCHEN", "/sales")).toBe(true);
  });
});
