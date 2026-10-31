import { isRestaurantManager, type RestaurantStation } from "@/lib/restaurant/station-policy";

export type RestaurantWorkspaceView = "SELECTION" | "MANAGER" | "ORDER_TAKING" | "KITCHEN";

/**
 * A single restaurant owns all three station experiences. Selecting a route
 * only focuses the navigation, it never changes the authenticated tenant or
 * grants permission. Every station action continues to check server-side roles.
 */
export function restaurantWorkspaceView(pathname: string): RestaurantWorkspaceView {
  if (pathname === "/restaurant" || pathname === "/restaurant/") return "SELECTION";
  if (pathname === "/restaurant/kitchen" || pathname.startsWith("/restaurant/kitchen/")) return "KITCHEN";
  if (
    pathname === "/restaurant/pos" || pathname.startsWith("/restaurant/pos/") ||
    pathname === "/restaurant/orders" || pathname.startsWith("/restaurant/orders/")
  ) return "ORDER_TAKING";
  if (
    pathname === "/restaurant/manager" || pathname.startsWith("/restaurant/manager/") ||
    pathname === "/restaurant/menu" || pathname.startsWith("/restaurant/menu/") ||
    pathname === "/restaurant/whatsapp" || pathname.startsWith("/restaurant/whatsapp/")
  ) return "MANAGER";
  return "SELECTION";
}

const selection = ["/restaurant"];
const orderTaking = ["/restaurant", "/restaurant/pos", "/restaurant/orders"];
const kitchen = ["/restaurant", "/restaurant/kitchen"];
const management = [
  "/restaurant",
  "/restaurant/manager",
  "/restaurant/manager/staff",
  "/restaurant/manager/shifts",
  "/restaurant/manager/insights",
  "/restaurant/menu",
  "/restaurant/whatsapp",
  "/inventory",
  "/purchases",
  "/goods-receipts",
  "/suppliers",
  "/supplier-returns",
  "/accounting/cash-bank",
  "/accounting/expenses",
  "/reports",
  "/settings",
];

/**
 * Staff must never see navigation entries for other stations, even if they
 * navigate to a guessed URL. Server-side station assertions stay authoritative.
 * Managers can supervise every station, but each screen has a focused sidebar.
 */
export function restaurantNavigationPaths(
  pathname: string,
  role: string,
  assignedStation: RestaurantStation | null,
): ReadonlySet<string> {
  if (!isRestaurantManager(role)) {
    if (role !== "STAFF") return new Set(selection);
    if (assignedStation === "CASHIER") return new Set(orderTaking);
    if (assignedStation === "KITCHEN") return new Set(kitchen);
    return new Set(selection);
  }

  switch (restaurantWorkspaceView(pathname)) {
    case "ORDER_TAKING": return new Set(orderTaking);
    case "KITCHEN": return new Set(kitchen);
    case "MANAGER": return new Set(management);
    default: return new Set(selection);
  }
}
