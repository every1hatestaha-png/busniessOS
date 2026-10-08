import type { Role, WorkspaceVertical } from "@prisma/client";

export type RestaurantStation = "ALL" | "POS" | "KITCHEN";

export function isRestrictedRestaurantStaff(role: Role, vertical: WorkspaceVertical, station: string) {
  return role === "STAFF" && vertical === "RESTAURANT" && station !== "ALL";
}

const scopedPrintPath = /^\/restaurant\/orders\/[0-9a-f-]{36}\/print$/i;

/** Route gates must run on the server. Hiding links alone is never authorization. */
export function canOpenRestaurantStationPath(
  role: Role, vertical: WorkspaceVertical, station: string, pathname: string | null,
) {
  if (!isRestrictedRestaurantStaff(role, vertical, station)) return true;
  if (!pathname) return false;
  if (station === "POS") {
    return pathname === "/restaurant/pos"
      || pathname === "/restaurant/orders"
      || scopedPrintPath.test(pathname);
  }
  if (station === "KITCHEN") {
    return pathname === "/restaurant/kitchen" || scopedPrintPath.test(pathname);
  }
  return false;
}

export function restaurantStationHome(station: string) {
  return station === "KITCHEN" ? "/restaurant/kitchen" : "/restaurant/pos";
}

export function canPerformRestaurantStationAction(
  role: Role, vertical: WorkspaceVertical, station: string, action: "POS" | "KITCHEN",
) {
  if (!isRestrictedRestaurantStaff(role, vertical, station)) return true;
  return station === action;
}
