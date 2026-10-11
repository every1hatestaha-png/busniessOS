import "server-only";

import { Prisma } from "@prisma/client";

import { writeAudit } from "@/lib/server/audit";
import { assertRestaurantActorAccess } from "@/lib/server/restaurant-actor-access";
import { canTransitionKitchenTicket, type KitchenTicketStatus } from "@/lib/domain/industry-lifecycles";
import { IndustryDomainError, requireWorkspaceModule, type IndustryContext } from "@/lib/server/industry-modules";
import { withSerializableRetry } from "@/lib/server/tx-retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function updateLegacyKitchenTicketStatusSafely(
  context: IndustryContext,
  ticketId: string,
  status: KitchenTicketStatus,
) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  if (!UUID.test(ticketId)) throw new IndustryDomainError("INVALID_STATE", "Kitchen ticket is invalid.");

  return withSerializableRetry(async (tx) => {
    // Persisted station membership is the final authority for legacy KOT
    // updates. A stale action context or a direct service caller is insufficient.
    await assertRestaurantActorAccess(tx, context, "KITCHEN", "Legacy kitchen ticket update");
    const rows = await tx.$queryRaw<Array<{
      id: string;
      status: KitchenTicketStatus;
      salesOrderId: string | null;
      restaurantOrderId: string | null;
      restaurantTableId: string | null;
    }>>`
      SELECT "id"::text AS "id", "status", "salesOrderId"::text AS "salesOrderId",
             "restaurantOrderId"::text AS "restaurantOrderId", "restaurantTableId"::text AS "restaurantTableId"
      FROM "kitchen_tickets"
      WHERE "id"=${ticketId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new IndustryDomainError("NOT_FOUND", "Kitchen ticket was not found.");

    if (current.restaurantOrderId) {
      throw new IndustryDomainError(
        "INVALID_STATE",
        "Restaurant-native kitchen tickets must be managed from the Restaurant Kitchen board.",
      );
    }
    if (current.status === status) return { id: ticketId, status, alreadyApplied: true as const };
    if (!canTransitionKitchenTicket(current.status, status)) {
      throw new IndustryDomainError("INVALID_STATE", `Kitchen ticket cannot move from ${current.status} to ${status}.`);
    }

    // Legacy sales orders already post their own inventory and accounting when the
    // sale is created. This compatibility ticket is status-only. It must never
    // become a second inventory-posting authority.
    await tx.$executeRaw`
      UPDATE "kitchen_tickets"
      SET "status"=${status},
          "startedAt"=CASE WHEN ${status}='PREPARING' AND "startedAt" IS NULL THEN now() ELSE "startedAt" END,
          "readyAt"=CASE WHEN ${status}='READY' AND "readyAt" IS NULL THEN now() ELSE "readyAt" END,
          "servedAt"=CASE WHEN ${status}='SERVED' AND "servedAt" IS NULL THEN now() ELSE "servedAt" END,
          "updatedAt"=now()
      WHERE "id"=${ticketId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;

    if ((status === "SERVED" || status === "CANCELLED") && current.restaurantTableId) {
      const otherLiveTickets = await tx.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count"
        FROM "kitchen_tickets"
        WHERE "workspaceId"=${context.workspaceId}::uuid
          AND "restaurantTableId"=${current.restaurantTableId}::uuid
          AND "id"<>${ticketId}::uuid
          AND "status" NOT IN ('SERVED','CANCELLED')
      `;
      const nativeLiveOrders = await tx.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count"
        FROM "restaurant_orders"
        WHERE "workspaceId"=${context.workspaceId}::uuid
          AND "restaurantTableId"=${current.restaurantTableId}::uuid
          AND "status" IN ('PENDING_REVIEW','CONFIRMED','PREPARING','READY')
      `;
      if ((otherLiveTickets[0]?.count ?? 0) === 0 && (nativeLiveOrders[0]?.count ?? 0) === 0) {
        await tx.$executeRaw`
          UPDATE "restaurant_tables"
          SET "status"='AVAILABLE', "updatedAt"=now()
          WHERE "id"=${current.restaurantTableId}::uuid
            AND "workspaceId"=${context.workspaceId}::uuid
            AND "status"='OCCUPIED'
        `;
      }
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.legacy_kot.status_changed",
      entityType: "KitchenTicket",
      entityId: ticketId,
      metadata: {
        from: current.status,
        to: status,
        salesOrderId: current.salesOrderId,
        inventoryPosted: false,
        compatibilityMode: true,
      },
    });

    return { id: ticketId, status, alreadyApplied: false as const };
  });
}
