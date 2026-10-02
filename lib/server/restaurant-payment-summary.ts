import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/server/db";
import { IndustryDomainError, requireWorkspaceModule } from "@/lib/server/industry-modules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SummaryRow = {
  restaurantOrderId: string;
  adjustedDue: Prisma.Decimal;
  retainedPaid: Prisma.Decimal;
};

function normalizeOrderScope(orderIds: string[]) {
  const ids = [...new Set(orderIds)];
  if (ids.length > 500) throw new IndustryDomainError("INVALID_STATE", "Select at most 500 restaurant orders.");
  for (const id of ids) {
    if (!UUID.test(id)) throw new IndustryDomainError("INVALID_STATE", "Restaurant order is invalid.");
  }
  return ids;
}

function mapSummary(rows: SummaryRow[]) {
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

export async function listRestaurantNetPaymentSummaries(workspaceId: string, orderIds?: string[]) {
  await requireWorkspaceModule(workspaceId, "restaurant");

  if (orderIds) {
    const ids = normalizeOrderScope(orderIds);
    if (!ids.length) return [];
    const scopedIds = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
    const rows = await db.$queryRaw<SummaryRow[]>`
      SELECT ro."id"::text AS "restaurantOrderId",
             GREATEST(
               ro."total" - COALESCE((
                 SELECT SUM(rr."total")
                 FROM "restaurant_returns" rr
                 WHERE rr."workspaceId"=${workspaceId}::uuid
                   AND rr."restaurantOrderId"=ro."id"
               ), 0),
               0
             )::numeric(15,2) AS "adjustedDue",
             GREATEST(
               COALESCE((
                 SELECT SUM(rp."amount")
                 FROM "restaurant_payments" rp
                 WHERE rp."workspaceId"=${workspaceId}::uuid
                   AND rp."restaurantOrderId"=ro."id"
                   AND rp."voidedAt" IS NULL
               ), 0)
               - COALESCE((
                 SELECT SUM(rrpa."amount")
                 FROM "restaurant_return_payment_allocations" rrpa
                 INNER JOIN "restaurant_payments" allocated_payment
                   ON allocated_payment."id"=rrpa."restaurantPaymentId"
                  AND allocated_payment."workspaceId"=rrpa."workspaceId"
                 WHERE rrpa."workspaceId"=${workspaceId}::uuid
                   AND allocated_payment."restaurantOrderId"=ro."id"
                   AND allocated_payment."voidedAt" IS NULL
               ), 0),
               0
             )::numeric(15,2) AS "retainedPaid"
      FROM "restaurant_orders" ro
      WHERE ro."workspaceId"=${workspaceId}::uuid
        AND ro."id" IN (${scopedIds})
    `;
    return mapSummary(rows);
  }

  // Keep the unscoped service behavior for callers that intentionally need the
  // complete workspace projection. Operational boards should pass their exact
  // visible order IDs so history size cannot make page cost grow without bound.
  const rows = await db.$queryRaw<SummaryRow[]>`
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

  return mapSummary(rows);
}
