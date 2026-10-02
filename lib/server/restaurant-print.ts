import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { requireWorkspaceModule } from "@/lib/server/industry-modules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Order = {
  orderNumber: string; status: string; paymentStatus: string; fulfillmentType: string;
  tableName: string | null; customerName: string | null; notes: string | null;
  createdAt: Date; subtotal: Prisma.Decimal; discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal; total: Prisma.Decimal;
};
type Item = { itemName: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal; notes: string | null; modifiers: unknown };
type Payment = { method: string; amount: Prisma.Decimal; createdAt: Date; postedAt: Date | null; voidedAt: Date | null };
type Return = { returnNumber: string; reason: string; total: Prisma.Decimal; createdAt: Date; isReversal: boolean };
type Refund = { amount: Prisma.Decimal; reason: string; createdAt: Date };

export async function getRestaurantPrintDocument(workspaceId: string, orderId: string) {
  if (!UUID.test(orderId)) return null;
  await requireWorkspaceModule(workspaceId, "restaurant");
  // One repeatable snapshot prevents a receipt mixing pre-return items with
  // post-return payment totals during a concurrent financial mutation.
  return db.$transaction(async (tx) => {
    const orders = await tx.$queryRaw<Order[]>`
      SELECT ro."orderNumber", ro."status", ro."paymentStatus", ro."fulfillmentType",
        ro."customerName", ro."notes", ro."createdAt", ro."subtotal", ro."discountAmount",
        ro."taxAmount", ro."total", rt."name" AS "tableName"
      FROM "restaurant_orders" ro
      LEFT JOIN "restaurant_tables" rt ON rt."id"=ro."restaurantTableId" AND rt."workspaceId"=ro."workspaceId"
      WHERE ro."workspaceId"=${workspaceId}::uuid AND ro."id"=${orderId}::uuid
    `;
    if (!orders[0]) return null;
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } });
    const items = await tx.$queryRaw<Item[]>`
      SELECT oi."itemName", oi."quantity", oi."unitPrice", oi."lineTotal", oi."notes", oi."modifiers"
      FROM "restaurant_order_items" oi
      INNER JOIN "restaurant_orders" ro ON ro."id"=oi."restaurantOrderId" AND ro."workspaceId"=${workspaceId}::uuid
      WHERE oi."restaurantOrderId"=${orderId}::uuid ORDER BY oi."createdAt", oi."id"
    `;
    const payments = await tx.$queryRaw<Payment[]>`
      SELECT "method", "amount", "createdAt", "postedAt", "voidedAt" FROM "restaurant_payments"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid ORDER BY "createdAt", "id"
    `;
    const returns = await tx.$queryRaw<Return[]>`
      SELECT "returnNumber", "reason", "total", "createdAt", "isReversal" FROM "restaurant_returns"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid ORDER BY "createdAt", "id"
    `;
    const refunds = await tx.$queryRaw<Refund[]>`
      SELECT "amount", "reason", "createdAt" FROM "restaurant_refunds"
      WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid ORDER BY "createdAt", "id"
    `;
    const allocations = await tx.$queryRaw<Array<{ amount: Prisma.Decimal }>>`
      SELECT COALESCE(SUM(a."amount"), 0)::numeric AS "amount"
      FROM "restaurant_return_payment_allocations" a
      INNER JOIN "restaurant_payments" p ON p."id"=a."restaurantPaymentId" AND p."workspaceId"=a."workspaceId"
      WHERE a."workspaceId"=${workspaceId}::uuid AND p."restaurantOrderId"=${orderId}::uuid AND p."voidedAt" IS NULL
    `;
    const order = orders[0];
    const returnedTotal = returns.reduce((sum, row) => sum.plus(row.total), new Prisma.Decimal(0));
    const adjustedDue = Prisma.Decimal.max(new Prisma.Decimal(order.total).minus(returnedTotal), 0);
    const retainedPaid = Prisma.Decimal.max(payments.filter((p) => !p.voidedAt).reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)).minus(allocations[0]?.amount ?? 0), 0);
    return {
      ...order, timezone: workspace.timezone,
      subtotal: Number(order.subtotal), discountAmount: Number(order.discountAmount), taxAmount: Number(order.taxAmount), total: Number(order.total),
      adjustedDue: Number(adjustedDue), retainedPaid: Number(retainedPaid), outstanding: Number(Prisma.Decimal.max(adjustedDue.minus(retainedPaid), 0)),
      items: items.map((row) => ({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), lineTotal: Number(row.lineTotal), modifiers: Array.isArray(row.modifiers) ? row.modifiers.filter((value): value is string => typeof value === "string") : [] })),
      payments: payments.map((row) => ({ ...row, amount: Number(row.amount) })),
      returns: returns.map((row) => ({ ...row, total: Number(row.total) })),
      refunds: refunds.map((row) => ({ ...row, amount: Number(row.amount) })),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export type RestaurantPrintDocument = NonNullable<Awaited<ReturnType<typeof getRestaurantPrintDocument>>>;
