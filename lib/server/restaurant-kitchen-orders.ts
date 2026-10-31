import "server-only";

import { db } from "@/lib/server/db";
import { IndustryDomainError, requireWorkspaceModule } from "@/lib/server/industry-modules";

export type KitchenOrderStage = "CONFIRMED" | "PREPARING" | "READY";

const stages = new Set<KitchenOrderStage>(["CONFIRMED", "PREPARING", "READY"]);

/**
 * Kitchen is a strictly operational read model. Do not select order totals,
 * payment status, customer phone, delivery address or financial accounts.
 * The station page verifies the authenticated STAFF assignment separately.
 */
export async function listKitchenOrders(
  workspaceId: string,
  stage: KitchenOrderStage,
  limit = 75,
) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  if (!stages.has(stage)) throw new IndustryDomainError("INVALID_STATE", "Kitchen stage is invalid.");
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.trunc(limit), 75)) : 75;
  return db.$queryRaw<Array<{
    id: string;
    orderNumber: string;
    fulfillmentType: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
    status: KitchenOrderStage;
    tableName: string | null;
    createdAt: Date;
    notes: string | null;
  }>>`
    SELECT ro."id", ro."orderNumber", ro."fulfillmentType", ro."status",
           rt."name" AS "tableName", ro."createdAt", ro."notes"
    FROM "restaurant_orders" ro
    LEFT JOIN "restaurant_tables" rt
      ON rt."id"=ro."restaurantTableId" AND rt."workspaceId"=ro."workspaceId"
    WHERE ro."workspaceId"=${workspaceId}::uuid
      AND ro."status"=${stage}
    ORDER BY ro."createdAt" ASC, ro."id" ASC
    LIMIT ${safeLimit}
  `;
}
