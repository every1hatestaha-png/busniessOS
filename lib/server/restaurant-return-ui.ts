import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/server/db";
import { IndustryDomainError, requireWorkspaceModule, type IndustryContext } from "@/lib/server/industry-modules";

const MANAGER_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);
const ZERO = new Prisma.Decimal(0);

function assertManager(context: IndustryContext) {
  if (!MANAGER_ROLES.has(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Manager access is required for restaurant returns.");
  }
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new IndustryDomainError("INVALID_STATE", `${label} is invalid.`);
  }
}

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function quantity(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

export async function getRestaurantReturnUiState(workspaceId: string, orderId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  assertUuid(orderId, "Restaurant order");

  const orders = await db.$queryRaw<Array<{
    id: string;
    orderNumber: string;
    status: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    total: Prisma.Decimal;
  }>>`
    SELECT "id"::text AS "id", "orderNumber", "status", "subtotal", "discountAmount", "taxAmount", "total"
    FROM "restaurant_orders"
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
    LIMIT 1
  `;
  const order = orders[0];
  if (!order) throw new IndustryDomainError("NOT_FOUND", "Restaurant order was not found.");

  const items = await db.$queryRaw<Array<{
    id: string;
    itemName: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    returnedQuantity: Prisma.Decimal;
  }>>`
    SELECT roi."id"::text AS "id", roi."itemName", roi."quantity", roi."unitPrice", roi."lineTotal",
           COALESCE(SUM(rri."quantity"), 0)::numeric AS "returnedQuantity"
    FROM "restaurant_order_items" roi
    INNER JOIN "restaurant_orders" ro ON ro."id"=roi."restaurantOrderId" AND ro."workspaceId"=${workspaceId}::uuid
    LEFT JOIN "restaurant_return_items" rri ON rri."restaurantOrderItemId"=roi."id" AND rri."workspaceId"=${workspaceId}::uuid
    WHERE roi."restaurantOrderId"=${orderId}::uuid
    GROUP BY roi."id", roi."itemName", roi."quantity", roi."unitPrice", roi."lineTotal", roi."createdAt"
    ORDER BY roi."createdAt", roi."id"
  `;

  const returns = await db.$queryRaw<Array<{
    id: string;
    returnNumber: string;
    reason: string;
    total: Prisma.Decimal;
    inventoryCost: Prisma.Decimal;
    createdAt: Date;
  }>>`
    SELECT "id"::text AS "id", "returnNumber", "reason", "total", "inventoryCost", "createdAt"
    FROM "restaurant_returns"
    WHERE "workspaceId"=${workspaceId}::uuid AND "restaurantOrderId"=${orderId}::uuid
    ORDER BY "createdAt" DESC, "id" DESC
  `;

  return {
    order: {
      ...order,
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      taxAmount: Number(order.taxAmount),
      total: Number(order.total),
    },
    items: items.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      returnedQuantity: Number(item.returnedQuantity),
      remainingQuantity: Number(quantity(new Prisma.Decimal(item.quantity).minus(item.returnedQuantity))),
    })),
    returns: returns.map((row) => ({
      ...row,
      total: Number(row.total),
      inventoryCost: Number(row.inventoryCost),
    })),
  };
}

export async function prepareRestaurantSingleItemReturn(
  context: IndustryContext,
  input: { orderId: string; orderItemId: string; quantity: number | string },
) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(input.orderId, "Restaurant order");
  assertUuid(input.orderItemId, "Restaurant order item");

  const requestedQuantity = quantity(input.quantity);
  if (!requestedQuantity.isFinite() || requestedQuantity.lte(0)) {
    throw new IndustryDomainError("INVALID_STATE", "Return quantity must be greater than zero.");
  }

  const orders = await db.$queryRaw<Array<{
    id: string;
    status: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    total: Prisma.Decimal;
    inventoryPostedAt: Date | null;
    accountingPostedAt: Date | null;
  }>>`
    SELECT "id"::text AS "id", "status", "subtotal", "discountAmount", "taxAmount", "total",
           "inventoryPostedAt", "accountingPostedAt"
    FROM "restaurant_orders"
    WHERE "id"=${input.orderId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    LIMIT 1
  `;
  const order = orders[0];
  if (!order) throw new IndustryDomainError("NOT_FOUND", "Restaurant order was not found.");
  if (order.status !== "COMPLETED" || !order.inventoryPostedAt || !order.accountingPostedAt) {
    throw new IndustryDomainError("INVALID_STATE", "Only fully posted completed restaurant orders can be returned.");
  }
  if (new Prisma.Decimal(order.subtotal).lte(0)) {
    throw new IndustryDomainError("INVALID_STATE", "A zero-subtotal order cannot be returned through this screen.");
  }

  const items = await db.$queryRaw<Array<{
    id: string;
    quantity: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    returnedQuantity: Prisma.Decimal;
  }>>`
    SELECT roi."id"::text AS "id", roi."quantity", roi."lineTotal",
           COALESCE(SUM(rri."quantity"), 0)::numeric AS "returnedQuantity"
    FROM "restaurant_order_items" roi
    INNER JOIN "restaurant_orders" ro ON ro."id"=roi."restaurantOrderId" AND ro."workspaceId"=${context.workspaceId}::uuid
    LEFT JOIN "restaurant_return_items" rri ON rri."restaurantOrderItemId"=roi."id" AND rri."workspaceId"=${context.workspaceId}::uuid
    WHERE roi."restaurantOrderId"=${input.orderId}::uuid
    GROUP BY roi."id", roi."quantity", roi."lineTotal", roi."createdAt"
    ORDER BY roi."createdAt", roi."id"
  `;
  const selected = items.find((item) => item.id === input.orderItemId);
  if (!selected) throw new IndustryDomainError("NOT_FOUND", "Restaurant order item was not found on this order.");
  if (new Prisma.Decimal(selected.returnedQuantity).plus(requestedQuantity).gt(selected.quantity)) {
    throw new IndustryDomainError("INVALID_STATE", "Return quantity exceeds the remaining item quantity.");
  }

  const ratio = requestedQuantity.div(selected.quantity);
  const returnSubtotal = money(new Prisma.Decimal(selected.lineTotal).mul(ratio));
  let returnDiscount = money(new Prisma.Decimal(order.discountAmount).mul(returnSubtotal.div(order.subtotal)));
  let returnTax = money(new Prisma.Decimal(order.taxAmount).mul(returnSubtotal.div(order.subtotal)));

  const exhaustsOrder = items.every((item) => {
    const requested = item.id === selected.id ? requestedQuantity : ZERO;
    return new Prisma.Decimal(item.returnedQuantity).plus(requested).equals(item.quantity);
  });

  if (exhaustsOrder) {
    const prior = await db.$queryRaw<Array<{ discountAmount: Prisma.Decimal; taxAmount: Prisma.Decimal }>>`
      SELECT COALESCE(SUM("discountAmount"), 0)::numeric AS "discountAmount",
             COALESCE(SUM("taxAmount"), 0)::numeric AS "taxAmount"
      FROM "restaurant_returns"
      WHERE "workspaceId"=${context.workspaceId}::uuid AND "restaurantOrderId"=${input.orderId}::uuid
    `;
    returnDiscount = money(new Prisma.Decimal(order.discountAmount).minus(prior[0]?.discountAmount ?? 0));
    returnTax = money(new Prisma.Decimal(order.taxAmount).minus(prior[0]?.taxAmount ?? 0));
  }

  const returnTotal = money(returnSubtotal.minus(returnDiscount).plus(returnTax));
  if (returnTotal.lte(0)) {
    throw new IndustryDomainError("INVALID_STATE", "Calculated return amount must be greater than zero.");
  }

  const payments = await db.$queryRaw<Array<{
    id: string;
    amount: Prisma.Decimal;
    createdAt: Date;
    priorAllocated: Prisma.Decimal;
  }>>`
    SELECT rp."id"::text AS "id", rp."amount", rp."createdAt",
           COALESCE(SUM(rrpa."amount"), 0)::numeric AS "priorAllocated"
    FROM "restaurant_payments" rp
    LEFT JOIN "restaurant_return_payment_allocations" rrpa
      ON rrpa."restaurantPaymentId"=rp."id" AND rrpa."workspaceId"=rp."workspaceId"
    LEFT JOIN "restaurant_refunds" rf
      ON rf."restaurantPaymentId"=rp."id" AND rf."workspaceId"=rp."workspaceId"
    WHERE rp."workspaceId"=${context.workspaceId}::uuid
      AND rp."restaurantOrderId"=${input.orderId}::uuid
      AND rp."postedAt" IS NOT NULL
      AND rp."voidedAt" IS NULL
      AND rf."id" IS NULL
    GROUP BY rp."id", rp."amount", rp."createdAt"
    ORDER BY rp."createdAt", rp."id"
  `;

  let remaining = returnTotal;
  const paymentAllocations: Array<{ paymentId: string; amount: number }> = [];
  for (const payment of payments) {
    if (remaining.lte(0)) break;
    const available = money(new Prisma.Decimal(payment.amount).minus(payment.priorAllocated));
    if (available.lte(0)) continue;
    const take = Prisma.Decimal.min(available, remaining);
    paymentAllocations.push({ paymentId: payment.id, amount: money(take).toNumber() });
    remaining = money(remaining.minus(take));
  }
  if (remaining.gt(0)) {
    throw new IndustryDomainError("INVALID_STATE", "Posted restaurant payments do not have enough refundable balance for this return.");
  }

  return {
    total: returnTotal.toNumber(),
    paymentAllocations,
  };
}
