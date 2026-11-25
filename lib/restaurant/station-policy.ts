/**
 * A Restaurant workspace uses a single operational station per STAFF member.
 * Managers can supervise all stations. No session-selected station or hidden
 * form field grants permission by itself.
 */
export type RestaurantStation = "CASHIER" | "KITCHEN";
export type RestaurantStationOperation = "CASHIER" | "KITCHEN" | "MANAGER";

export function isRestaurantManager(role: string): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
}

export function canUseRestaurantStation(
  role: string,
  assignedStation: RestaurantStation | null,
  operation: RestaurantStationOperation,
): boolean {
  if (isRestaurantManager(role)) return true;
  return role === "STAFF" && operation !== "MANAGER" && assignedStation === operation;
}

export function canTransitionRestaurantOrder(
  operation: RestaurantStationOperation,
  nextStatus: string,
): boolean {
  if (operation === "KITCHEN") return nextStatus === "PREPARING" || nextStatus === "READY";
  if (operation === "CASHIER") return nextStatus === "COMPLETED";
  return nextStatus === "CANCELLED";
}
