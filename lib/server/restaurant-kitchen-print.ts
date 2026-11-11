import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { requireWorkspaceModule } from "@/lib/server/industry-modules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Kitchen-only KOT projection. Never fetch prices, payment records,
 * discounts, bank accounts, customer names or contact details.
 * Full financial receipts use the separate cashier-only print projection.
 */
export async function getRestaurantKitchenPrintDocument(workspaceId: string, orderId: string) {
  if (!UUID.test(orderId)) return null;
  await requireWorkspaceModule(workspaceId, "restaurant");
  return db.$transaction(async tx => {
    const orders = await tx.$queryRaw<Array<{
      orderNumber: string;
      status: string;
      fulfillmentType: string;
      tableName: string | null;
      notes: string | null;
      createdAt: Date;
    }>>`
      SELECT ro."orderNumber", ro."status", ro."fulfillmentType",
        rt."name" AS "tableName", ro."notes", ro."createdAt"
      FROM "restaurant_orders" ro
      LEFT JOIN "restaurant_tables" rt
        ON rt."id"=ro."restaurantTableId" AND rt."workspaceId"=ro."workspaceId"
      WHERE ro."workspaceId"=${workspaceId}::uuid
        AND ro."id"=${orderId}::uuid
    `;
    const order = orders[0];
    if (!order) return null;
    const items = await tx.$queryRaw<Array<{
      itemName: string; quantity: Prisma.Decimal; notes: string | null; modifiers: unknown;
    }>>`
      SELECT oi."itemName", oi."quantity", oi."notes", oi."modifiers"
      FROM "restaurant_order_items" oi
      INNER JOIN "restaurant_orders" ro
        ON ro."id"=oi."restaurantOrderId" AND ro."workspaceId"=${workspaceId}::uuid
      WHERE oi."restaurantOrderId"=${orderId}::uuid
      ORDER BY oi."createdAt", oi."id"
    `;
    return {
      ...order,
      items: items.map(item => ({
        itemName: item.itemName,
        quantity: Number(item.quantity),
        notes: item.notes,
        modifiers: Array.isArray(item.modifiers)
          ? item.modifiers.filter((value): value is string => typeof value === "string")
          : [],
      })),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export type RestaurantKitchenPrintDocument = NonNullable<Awaited<ReturnType<typeof getRestaurantKitchenPrintDocument>>>;
