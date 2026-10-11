import "server-only";

import type { Prisma, Role } from "@prisma/client";
import { canPerformRestaurantStationAction } from "@/lib/restaurant/station-access";
import { canPerformAction } from "@/lib/server/authorization";
import { IndustryDomainError, type IndustryContext } from "@/lib/server/industry-modules";

/** Lock persisted authority until the mutation commits, including stale callers. */
export async function assertRestaurantActorAccess(
  tx: Prisma.TransactionClient, context: IndustryContext,
  operation: "POS" | "KITCHEN" | "FINANCIAL", label: string,
) {
  const members = await tx.$queryRaw<Array<{ role: Role; restaurantStation: string }>>`
    SELECT "role", "restaurantStation" FROM "workspace_members"
    WHERE "workspaceId"=${context.workspaceId} AND "userId"=${context.userId ?? ""}
    FOR SHARE
  `;
  const member = members[0];
  if (!member || (operation === "FINANCIAL"
    ? !canPerformAction(member.role, "financial.manage")
    : !canPerformRestaurantStationAction(member.role, "RESTAURANT", member.restaurantStation, operation))) {
    throw new IndustryDomainError("PERMISSION_DENIED", operation === "FINANCIAL"
      ? `${label} requires a manager actor from the same workspace`
      : `${label} requires current ${operation} station membership in the same workspace`);
  }
  // The locked, persisted role is authoritative for downstream ownership
  // decisions. A caller-supplied or cached context.role may be stale.
  return member;
}
