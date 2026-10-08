import type { Role } from "@prisma/client";
import type { RestaurantOrderStatus } from "@/lib/server/restaurant-workspace";

/**
 * Match the server action + transactional integrity policy. COMPLETED
 * posts stock and general-ledger effects and therefore requires manager rights.
 * A cashier may collect a payment but may not finalize accounting.
 */
export function canShowOrderBoardTransition(
  role: Role,
  station: string,
  nextStatus: RestaurantOrderStatus,
): boolean {
  if (nextStatus === "COMPLETED") {
    return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  }
  if (nextStatus !== "PREPARING" && nextStatus !== "READY") return false;
  return role !== "STAFF" || station === "ALL";
}
