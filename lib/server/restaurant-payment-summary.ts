import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/server/db";
import { requireWorkspaceModule } from "@/lib/server/industry-modules";

export async function listRestaurantNetPaymentSummaries(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const rows = await db.$queryRaw<Array<{
    restaurantOrderId: string;
    adjustedDue: Prisma.Decimal;
    retainedPaid: Prisma.Decimal;
  }>>`
    SELECT ro."id"::text AS "restaurantOrderId",
           GREATEST(ro."total" - COALESCE(ret."returnedTotal", 0), 0)::numeric(15,2) AS "adjustedDue",
           GREATEST(COALESCE(pay."activePaid", 0) - COALESCE(alloc."activeAllocated", 0), 0)::numeric(15,2) AS "retainedPaid"
    FROM "restaurant_orders" ro
    LEFT JOIN (
      SELECT "restaurantOrderId", SUM("total") AS "returnedTotal"
      FROM "restaurant_returns"
      WHERE "workspaceId"=${workspaceId}::uuid
      GROUP BY "restaurantOrderId"
    ) ret ON ret."restaurantOrderId"=ro."id"
    LEFT JOIN (
      SELECT "restaurantOrderId", SUM("amount") AS "activePaid"
      FROM "restaurant_payments"
      WHERE "workspaceId"=${workspaceId}::uuid AND "voidedAt" IS NULL
      GROUP BY "restaurantOrderId"
    ) pay ON pay."restaurantOrderId"=ro."id"
    LEFT JOIN (
      SELECT rp."restaurantOrderId", SUM(rrpa."amount") AS "activeAllocated"
      FROM "restaurant_return_payment_allocations" rrpa
      INNER JOIN "restaurant_payments" rp
        ON rp."id"=rrpa."restaurantPaymentId" AND rp."workspaceId"=rrpa."workspaceId"
      WHERE rrpa."workspaceId"=${workspaceId}::uuid AND rp."voidedAt" IS NULL
      GROUP BY rp."restaurantOrderId"
    ) alloc ON alloc."restaurantOrderId"=ro."id"
    WHERE ro."workspaceId"=${workspaceId}::uuid
  `;

  return rows.map((row) => {
    const adjustedDue = Number(row.adjustedDue);
    const retainedPaid = Number(row.retainedPaid);
    return {
      restaurantOrderId: row.restaurantOrderId,
      adjustedDue,
      retainedPaid,
      outstanding: Math.max(0, Math.round((adjustedDue - retainedPaid) * 100) / 100),
    };
  });
}
