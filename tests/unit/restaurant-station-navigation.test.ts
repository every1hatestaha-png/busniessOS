import { describe, expect, it } from "vitest";
import { restaurantNavigationPaths, restaurantWorkspaceView } from "@/lib/restaurant/station-navigation";

describe("Restaurant workspace stations stay separate under the same workspace", () => {
  it("has one landing station chooser after restaurant login", () => {
    expect(restaurantWorkspaceView("/restaurant")).toBe("SELECTION");
    expect(restaurantWorkspaceView("/restaurant/")).toBe("SELECTION");
    expect([...restaurantNavigationPaths("/restaurant", "OWNER", null)]).toEqual(["/restaurant"]);
  });

  it("shows Manager, Order Taking and Kitchen as separate focused manager work screens", () => {
    const manager = restaurantNavigationPaths("/restaurant/manager", "OWNER", null);
    expect(manager.has("/restaurant/manager")).toBe(true);
    expect(manager.has("/restaurant/manager/staff")).toBe(true);
    expect(manager.has("/restaurant/pos")).toBe(false);
    expect(manager.has("/restaurant/kitchen")).toBe(false);

    const cashier = restaurantNavigationPaths("/restaurant/orders/abc/print", "OWNER", null);
    expect([...cashier]).toEqual(["/restaurant", "/restaurant/pos", "/restaurant/orders"]);

    const kitchen = restaurantNavigationPaths("/restaurant/kitchen", "OWNER", null);
    expect([...kitchen]).toEqual(["/restaurant", "/restaurant/kitchen"]);
  });

  it("only exposes the assigned operational station for each staff account", () => {
    for (const route of ["/restaurant", "/restaurant/kitchen", "/restaurant/manager", "/restaurant/pos"]) {
      expect([...restaurantNavigationPaths(route, "STAFF", "CASHIER")]).toEqual([
        "/restaurant", "/restaurant/pos", "/restaurant/orders",
      ]);
      expect([...restaurantNavigationPaths(route, "STAFF", "KITCHEN")]).toEqual([
        "/restaurant", "/restaurant/kitchen",
      ]);
      expect([...restaurantNavigationPaths(route, "STAFF", null)]).toEqual(["/restaurant"]);
    }
  });

  it("does not leak manager controls or financial navigation to other roles", () => {
    for (const role of ["GUEST", "UNKNOWN"]) {
      expect([...restaurantNavigationPaths("/restaurant/manager", role, null)]).toEqual(["/restaurant"]);
    }
    expect(restaurantWorkspaceView("/restaurant/orders")).toBe("ORDER_TAKING");
    expect(restaurantWorkspaceView("/restaurant/orders/some-order/return")).toBe("ORDER_TAKING");
    expect(restaurantWorkspaceView("/restaurant/manager/staff")).toBe("MANAGER");
    expect(restaurantWorkspaceView("/restaurant/menu")).toBe("MANAGER");
    expect(restaurantWorkspaceView("/restaurant/whatsapp")).toBe("MANAGER");
  });
});
