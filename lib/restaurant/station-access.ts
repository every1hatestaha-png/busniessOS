import type { RestaurantStation } from "@/lib/restaurant/station-policy";

/**
 * Server-page access policy for Restaurant STAFF. The navigation is not an
 * authorization boundary. A staff member cannot type a manager, finance,
 * inventory or generic ERP URL to escape their operational station.
 *
 * Managers/owners use the existing tenant and permission checks separately.
 */
export function canOpenRestaurantStaffPage(
  pathname: string | null,
  station: RestaurantStation | null,
): boolean {
  if (!pathname || !pathname.startsWith("/") || pathname.includes("?") || pathname.includes("#")) return false;
  if (pathname === "/restaurant" || pathname === "/restaurant/") return true;
  if (station === "CASHIER") {
    if (pathname === "/restaurant/pos" || pathname === "/restaurant/orders") return true;
    // Cashiers need their order receipt, never refunds, returns or manager tools.
    return /^\/restaurant\/orders\/[0-9a-f-]{36}\/print\/?$/i.test(pathname);
  }
  if (station === "KITCHEN") {
    if (pathname === "/restaurant/kitchen") return true;
    // Kitchen KOTs share the print route, whose server page verifies kind=kot.
    return /^\/restaurant\/orders\/[0-9a-f-]{36}\/print\/?$/i.test(pathname);
  }
  return false;
}

/**
 * Restaurant STAFF operate one assigned station in the active workspace.
 * Keep workspace switching and business creation out of that station UI,
 * and avoid exposing other workspace names through client navigation props.
 */
export function shouldShowWorkspaceSwitcher(vertical: string, role: string): boolean {
  return vertical !== "RESTAURANT" || role !== "STAFF";
}
