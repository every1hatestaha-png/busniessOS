import "server-only";

import { db } from "@/lib/server/db";
import { IndustryDomainError, requireWorkspaceModule } from "@/lib/server/industry-modules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The kitchen sees a correction alert, never a manager's account details.
 * Only the most recent correction time is exposed to the active restaurant
 * ticket. Financial metadata, employee identity and prior notes remain private.
 */
export async function listKitchenInstructionUpdateTimes(
  workspaceId: string, visibleOrderIds: string[],
): Promise<Map<string, Date>> {
  await requireWorkspaceModule(workspaceId, "restaurant");
  if (visibleOrderIds.length === 0) return new Map();
  if (visibleOrderIds.length > 250 || visibleOrderIds.some(id => !UUID.test(id))) {
    throw new IndustryDomainError("INVALID_STATE", "Kitchen ticket selection is invalid.");
  }
  const events = await db.auditLog.findMany({
    where: {
      workspaceId, entityType: "RestaurantOrder",
      action: "restaurant.order.kitchen_instructions_corrected",
      entityId: { in: visibleOrderIds },
    },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, createdAt: true },
    take: 250,
  });
  const updated = new Map<string, Date>();
  for (const event of events) {
    if (!updated.has(event.entityId)) updated.set(event.entityId, event.createdAt);
  }
  return updated;
}
