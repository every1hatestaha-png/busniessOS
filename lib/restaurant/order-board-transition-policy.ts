import type { Role } from "@prisma/client";

/**
 * Match the server action + transactional integrity policy. COMPLETED
 * posts stock and general-ledger effects and therefore requires manager rights.
 * A cashier may collect a payment but may not finalize accounting.
 */
export function canShowOrderBoardTransition(
  role: Role,
  station: string,
  nextStatus: "PREPARING" | "READY" | "COMPLETED",
): boolean {
  if (nextStatus === "COMPLETED") {
    return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  }
  return role !== "STAFF" || station === "ALL";
}
