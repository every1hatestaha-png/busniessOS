import { describe, expect, it } from "vitest";
import { canOpenRestaurantStaffPage } from "@/lib/restaurant/station-access";

const id = "017cded0-7da4-4e3a-8be3-913e5469972b";

describe("Restaurant server page access is fail closed", () => {
  it("lets a cashier use order-taking only, including receipts", () => {
    for (const path of ["/restaurant", "/restaurant/pos", "/restaurant/orders", `/restaurant/orders/${id}/print`]) {
      expect(canOpenRestaurantStaffPage(path, "CASHIER")).toBe(true);
    }
    for (const path of [
      "/dashboard", "/sales", "/reports", "/inventory", "/accounting/cash-bank",
      "/settings", "/restaurant/manager", "/restaurant/manager/staff", "/restaurant/menu",
      "/restaurant/kitchen", "/restaurant/whatsapp", `/restaurant/orders/${id}/return`,
    ]) expect(canOpenRestaurantStaffPage(path, "CASHIER")).toBe(false);
  });

  it("lets a cook use kitchen tickets only, with no manager or payment pages", () => {
    expect(canOpenRestaurantStaffPage("/restaurant", "KITCHEN")).toBe(true);
    expect(canOpenRestaurantStaffPage("/restaurant/kitchen", "KITCHEN")).toBe(true);
    // The print page itself checks the KITCHEN role and kind=kot.
    expect(canOpenRestaurantStaffPage(`/restaurant/orders/${id}/print`, "KITCHEN")).toBe(true);
    for (const path of [
      "/restaurant/pos", "/restaurant/orders", "/restaurant/manager", "/restaurant/menu",
      "/dashboard", "/sales", "/reports", "/inventory", "/settings", "/accounting/cash-bank",
    ]) expect(canOpenRestaurantStaffPage(path, "KITCHEN")).toBe(false);
  });

  it("blocks unassigned staff and missing or forged path values", () => {
    expect(canOpenRestaurantStaffPage("/restaurant", null)).toBe(true);
    for (const path of [null, "", "/", "/restaurant/pos", "/restaurant/kitchen", "/reports", "//restaurant", "/restaurant?mode=pos"]) {
      expect(canOpenRestaurantStaffPage(path, null)).toBe(false);
    }
    expect(canOpenRestaurantStaffPage(null, "CASHIER")).toBe(false);
    expect(canOpenRestaurantStaffPage(null, "KITCHEN")).toBe(false);
  });
});
