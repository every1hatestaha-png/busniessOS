import "server-only";

import { db } from "@/lib/server/db";
import { requireWorkspaceModule } from "@/lib/server/industry-modules";

export async function listRestaurantReturnReversalState(workspaceId: string, orderId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const rows = await db.$queryRaw<Array<{
    id: string;
    isReversal: boolean;
    reversalOfId: string | null;
    reversalReason: string | null;
    hasReversal: boolean;
  }>>`
    SELECT rr."id"::text AS "id", rr."isReversal", rr."reversalOfId"::text AS "reversalOfId", rr."reversalReason",
           EXISTS (
             SELECT 1 FROM "restaurant_returns" rev
             WHERE rev."workspaceId"=rr."workspaceId"
               AND rev."reversalOfId"=rr."id"
           ) AS "hasReversal"
    FROM "restaurant_returns" rr
    WHERE rr."workspaceId"=${workspaceId}::uuid
      AND rr."restaurantOrderId"=${orderId}::uuid
    ORDER BY rr."createdAt" DESC, rr."id" DESC
  `;
  return rows;
}
