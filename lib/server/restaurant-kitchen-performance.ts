import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { requireWorkspaceModule } from "@/lib/server/industry-modules";

/**
 * Read-only management report from KOT lifecycle evidence, not a kitchen
 * employee's financial ledger. Ready-at timestamps belong to kitchen tickets;
 * no fabricated ready time is inferred from order completion.
 */
export async function getRestaurantKitchenPerformance(workspaceId: string, days: 7 | 30) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
  const timezone = workspace?.timezone || "Asia/Karachi";
  const start = Prisma.sql`((date_trunc('day', now() AT TIME ZONE ${timezone}) - ((${days}::integer - 1) * interval '1 day')) AT TIME ZONE ${timezone})`;

  const [completed] = await db.$queryRaw<Array<{
    prepared: bigint; meanMinutes: number | null; p90Minutes: number | null;
    delayed20: bigint; fastestMinutes: number | null; slowestMinutes: number | null;
  }>>`
    WITH durations AS (
      SELECT GREATEST(EXTRACT(EPOCH FROM (kt."readyAt" - kt."startedAt")) / 60, 0)::numeric AS minutes
      FROM "kitchen_tickets" kt
      INNER JOIN "restaurant_orders" ro
        ON ro."id"=kt."restaurantOrderId" AND ro."workspaceId"=kt."workspaceId"
      WHERE kt."workspaceId"=${workspaceId}::uuid
        AND kt."readyAt" >= ${start}
        AND kt."startedAt" IS NOT NULL
        AND kt."readyAt" >= kt."startedAt"
        AND kt."status" IN ('READY','SERVED')
    )
    SELECT COUNT(*)::bigint AS "prepared",
      ROUND(AVG(minutes)::numeric,1)::float8 AS "meanMinutes",
      ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes))::numeric,1)::float8 AS "p90Minutes",
      COUNT(*) FILTER (WHERE minutes >= 20)::bigint AS "delayed20",
      ROUND(MIN(minutes)::numeric,1)::float8 AS "fastestMinutes",
      ROUND(MAX(minutes)::numeric,1)::float8 AS "slowestMinutes"
    FROM durations
  `;

  const [queue] = await db.$queryRaw<Array<{
    waiting: bigint; preparing: bigint; ready: bigint; waitingOver10: bigint;
    preparingOver20: bigint; cancelled: bigint;
  }>>`
    SELECT
      COUNT(*) FILTER (WHERE kt."status"='QUEUED')::bigint AS "waiting",
      COUNT(*) FILTER (WHERE kt."status"='PREPARING')::bigint AS "preparing",
      COUNT(*) FILTER (WHERE kt."status"='READY')::bigint AS "ready",
      COUNT(*) FILTER (WHERE kt."status"='QUEUED' AND kt."createdAt" <= now() - interval '10 minutes')::bigint AS "waitingOver10",
      COUNT(*) FILTER (WHERE kt."status"='PREPARING' AND kt."startedAt" <= now() - interval '20 minutes')::bigint AS "preparingOver20",
      COUNT(*) FILTER (WHERE kt."status"='CANCELLED' AND kt."updatedAt" >= ${start})::bigint AS "cancelled"
    FROM "kitchen_tickets" kt
    INNER JOIN "restaurant_orders" ro
      ON ro."id"=kt."restaurantOrderId" AND ro."workspaceId"=kt."workspaceId"
    WHERE kt."workspaceId"=${workspaceId}::uuid
  `;

  const durations = await db.$queryRaw<Array<{ day: string; prepared: bigint; meanMinutes: number | null }>>`
    SELECT (kt."readyAt" AT TIME ZONE ${timezone})::date::text AS "day",
      COUNT(*)::bigint AS "prepared",
      ROUND(AVG(EXTRACT(EPOCH FROM (kt."readyAt" - kt."startedAt")) / 60)::numeric,1)::float8 AS "meanMinutes"
    FROM "kitchen_tickets" kt
    INNER JOIN "restaurant_orders" ro
      ON ro."id"=kt."restaurantOrderId" AND ro."workspaceId"=kt."workspaceId"
    WHERE kt."workspaceId"=${workspaceId}::uuid
      AND kt."readyAt" >= ${start}
      AND kt."startedAt" IS NOT NULL
      AND kt."readyAt" >= kt."startedAt"
      AND kt."status" IN ('READY','SERVED')
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 30
  `;

  const n = (value: number | bigint | null | undefined) => Number(value ?? 0);
  return {
    days, timezone,
    prepared: n(completed?.prepared),
    meanMinutes: completed?.meanMinutes ?? null,
    p90Minutes: completed?.p90Minutes ?? null,
    delayed20: n(completed?.delayed20),
    fastestMinutes: completed?.fastestMinutes ?? null,
    slowestMinutes: completed?.slowestMinutes ?? null,
    waiting: n(queue?.waiting),
    preparing: n(queue?.preparing),
    ready: n(queue?.ready),
    waitingOver10: n(queue?.waitingOver10),
    preparingOver20: n(queue?.preparingOver20),
    cancelled: n(queue?.cancelled),
    byDay: durations.map(day => ({
      day: day.day, prepared: n(day.prepared), meanMinutes: day.meanMinutes,
    })),
  };
}
