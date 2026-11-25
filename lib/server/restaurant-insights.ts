import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { requireWorkspaceModule } from "@/lib/server/industry-modules";

/**
 * Management-only read model. The caller must enforce OWNER/ADMIN/MANAGER
 * before invoking this function. Values are tenant-scoped and read-only.
 * Sales: orders completed within the selected interval, net of all returns
 * recorded to date against those orders. Payment methods: captured receipts
 * created within the interval, excluding voided payments (not net refunds).
 */
export async function getRestaurantManagementInsights(workspaceId: string, periodDays: 7 | 30) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId }, select: { timezone: true },
  });
  const timezone = workspace?.timezone || "Asia/Karachi";
  const start = Prisma.sql`((date_trunc('day', now() AT TIME ZONE ${timezone}) - ((${periodDays}::integer - 1) * interval '1 day')) AT TIME ZONE ${timezone})`;

  const [summary] = await db.$queryRaw<Array<{
    completedOrders: bigint;
    cancelledOrders: bigint;
    grossSales: Prisma.Decimal;
    returns: Prisma.Decimal;
    netSales: Prisma.Decimal;
    discounts: Prisma.Decimal;
  }>>`
    WITH completed AS (
      SELECT ro."id", ro."total", ro."discountAmount"
      FROM "restaurant_orders" ro
      WHERE ro."workspaceId"=${workspaceId}::uuid AND ro."status"='COMPLETED'
        AND ro."completedAt" >= ${start}
    ), returned AS (
      SELECT rr."restaurantOrderId", COALESCE(SUM(rr."total"),0) AS "amount"
      FROM "restaurant_returns" rr
      INNER JOIN completed c ON c."id"=rr."restaurantOrderId"
      WHERE rr."workspaceId"=${workspaceId}::uuid
      GROUP BY rr."restaurantOrderId"
    )
    SELECT COUNT(*)::bigint AS "completedOrders",
      (SELECT COUNT(*)::bigint FROM "restaurant_orders" cancelled
       WHERE cancelled."workspaceId"=${workspaceId}::uuid AND cancelled."status"='CANCELLED'
         AND cancelled."createdAt" >= ${start}) AS "cancelledOrders",
      COALESCE(SUM(c."total"),0)::numeric AS "grossSales",
      COALESCE(SUM(COALESCE(r."amount",0)),0)::numeric AS "returns",
      COALESCE(SUM(GREATEST(c."total" - COALESCE(r."amount",0), 0)),0)::numeric AS "netSales",
      COALESCE(SUM(c."discountAmount"),0)::numeric AS "discounts"
    FROM completed c LEFT JOIN returned r ON r."restaurantOrderId"=c."id"
  `;

  const channels = await db.$queryRaw<Array<{ name: string; orders: bigint; netSales: Prisma.Decimal }>>`
    SELECT ro."fulfillmentType" AS "name", COUNT(*)::bigint AS "orders",
      COALESCE(SUM(GREATEST(ro."total" - COALESCE((
        SELECT SUM(rr."total") FROM "restaurant_returns" rr
        WHERE rr."workspaceId"=${workspaceId}::uuid
          AND rr."restaurantOrderId"=ro."id"
      ),0),0)),0)::numeric AS "netSales"
    FROM "restaurant_orders" ro
    WHERE ro."workspaceId"=${workspaceId}::uuid
      AND ro."status"='COMPLETED' AND ro."completedAt" >= ${start}
    GROUP BY ro."fulfillmentType" ORDER BY "orders" DESC, "name" ASC
  `;

  const paymentMethods = await db.$queryRaw<Array<{ name: string; amount: Prisma.Decimal; count: bigint }>>`
    SELECT rp."method" AS "name", COALESCE(SUM(rp."amount"),0)::numeric AS "amount",
      COUNT(*)::bigint AS "count"
    FROM "restaurant_payments" rp
    WHERE rp."workspaceId"=${workspaceId}::uuid AND rp."voidedAt" IS NULL
      AND rp."createdAt" >= ${start}
    GROUP BY rp."method" ORDER BY "amount" DESC, "name" ASC
  `;

  const popularItems = await db.$queryRaw<Array<{
    name: string; quantity: Prisma.Decimal; grossValue: Prisma.Decimal;
  }>>`
    SELECT roi."itemName" AS "name", COALESCE(SUM(roi."quantity"),0)::numeric AS "quantity",
      COALESCE(SUM(roi."lineTotal"),0)::numeric AS "grossValue"
    FROM "restaurant_order_items" roi
    INNER JOIN "restaurant_orders" ro
      ON ro."id"=roi."restaurantOrderId" AND ro."workspaceId"=${workspaceId}::uuid
    WHERE ro."status"='COMPLETED' AND ro."completedAt" >= ${start}
    GROUP BY roi."itemName" ORDER BY "quantity" DESC, "name" ASC LIMIT 10
  `;

  const toNumber = (value: Prisma.Decimal | bigint | number | null | undefined) => Number(value ?? 0);
  const completedOrders = toNumber(summary?.completedOrders);
  const netSales = toNumber(summary?.netSales);
  return {
    periodDays,
    timezone,
    completedOrders,
    cancelledOrders: toNumber(summary?.cancelledOrders),
    grossSales: toNumber(summary?.grossSales),
    returns: toNumber(summary?.returns),
    netSales,
    discounts: toNumber(summary?.discounts),
    avgCompletedOrder: completedOrders ? Math.round(netSales / completedOrders * 100) / 100 : 0,
    channels: channels.map(row => ({ name: row.name, orders: toNumber(row.orders), netSales: toNumber(row.netSales) })),
    paymentMethods: paymentMethods.map(row => ({ name: row.name, count: toNumber(row.count), amount: toNumber(row.amount) })),
    popularItems: popularItems.map(row => ({ name: row.name, quantity: toNumber(row.quantity), grossValue: toNumber(row.grossValue) })),
  };
}
