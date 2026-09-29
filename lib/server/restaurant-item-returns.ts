import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { postCustomerReturnToGeneralLedger } from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import {
  IndustryDomainError,
  requireWorkspaceModule,
  type IndustryContext,
} from "@/lib/server/industry-modules";
import {
  applyManagedWarehouseStockDelta,
  ManagedWarehouseStockError,
} from "@/lib/server/managed-warehouse-stock";
import { withSerializableRetry } from "@/lib/server/tx-retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGER_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);
const ZERO = new Prisma.Decimal(0);

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new IndustryDomainError("INVALID_STATE", `${label} is invalid.`);
}

function assertManager(context: IndustryContext) {
  if (!MANAGER_ROLES.has(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Manager access is required for restaurant returns.");
  }
}

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function quantity(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

function cleanReason(value: string) {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new IndustryDomainError("INVALID_STATE", "Provide a return reason between 3 and 500 characters.");
  }
  return reason;
}

function cleanIdempotencyKey(value?: string) {
  const key = value?.trim();
  if (!key) return null;
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) {
    throw new IndustryDomainError("INVALID_STATE", "Restaurant return request ID is invalid.");
  }
  return key;
}

function fingerprint(input: {
  orderId: string;
  reason: string;
  items: Array<{ orderItemId: string; quantity: string; restock: boolean }>;
  allocations: Array<{ paymentId: string; amount: string }>;
}) {
  const normalized = {
    orderId: input.orderId,
    reason: input.reason,
    items: [...input.items].sort((a, b) => a.orderItemId.localeCompare(b.orderItemId)),
    allocations: [...input.allocations].sort((a, b) => a.paymentId.localeCompare(b.paymentId)),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

type ReturnInput = {
  orderId: string;
  reason: string;
  idempotencyKey?: string;
  items: Array<{
    orderItemId: string;
    quantity: number | string;
    restock?: boolean;
  }>;
  paymentAllocations: Array<{
    paymentId: string;
    amount: number | string;
  }>;
};

type OrderItemRow = {
  id: string;
  itemName: string;
  quantity: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
};

type CalculatedLine = {
  orderItemId: string;
  itemName: string;
  originalQuantity: Prisma.Decimal;
  returnQuantity: Prisma.Decimal;
  restock: boolean;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  inventoryCost: Prisma.Decimal;
};

function buildInList(ids: string[]) {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
}

export async function createRestaurantItemReturn(context: IndustryContext, input: ReturnInput) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(input.orderId, "Restaurant order");

  const reason = cleanReason(input.reason);
  const idempotencyKey = cleanIdempotencyKey(input.idempotencyKey);
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) {
    throw new IndustryDomainError("INVALID_STATE", "Choose between 1 and 50 restaurant order items to return.");
  }
  if (!Array.isArray(input.paymentAllocations) || input.paymentAllocations.length < 1 || input.paymentAllocations.length > 20) {
    throw new IndustryDomainError("INVALID_STATE", "At least one original restaurant payment must fund the refund.");
  }

  const itemIds = input.items.map((item) => {
    assertUuid(item.orderItemId, "Restaurant order item");
    return item.orderItemId;
  });
  if (new Set(itemIds).size !== itemIds.length) {
    throw new IndustryDomainError("INVALID_STATE", "A restaurant order item can appear only once in a return request.");
  }

  const paymentIds = input.paymentAllocations.map((allocation) => {
    assertUuid(allocation.paymentId, "Restaurant payment");
    return allocation.paymentId;
  });
  if (new Set(paymentIds).size !== paymentIds.length) {
    throw new IndustryDomainError("INVALID_STATE", "A restaurant payment can appear only once in a return request.");
  }

  const normalizedItems = input.items.map((item) => {
    const returnQuantity = quantity(item.quantity);
    if (!returnQuantity.isFinite() || returnQuantity.lte(0)) {
      throw new IndustryDomainError("INVALID_STATE", "Restaurant return quantity must be greater than zero.");
    }
    return {
      orderItemId: item.orderItemId,
      quantity: returnQuantity,
      restock: item.restock === true,
    };
  });
  const normalizedAllocations = input.paymentAllocations.map((allocation) => {
    const amount = money(allocation.amount);
    if (!amount.isFinite() || amount.lte(0)) {
      throw new IndustryDomainError("INVALID_STATE", "Restaurant refund allocation must be greater than zero.");
    }
    return { paymentId: allocation.paymentId, amount };
  });

  const requestFingerprint = fingerprint({
    orderId: input.orderId,
    reason,
    items: normalizedItems.map((item) => ({
      orderItemId: item.orderItemId,
      quantity: item.quantity.toFixed(4),
      restock: item.restock,
    })),
    allocations: normalizedAllocations.map((allocation) => ({
      paymentId: allocation.paymentId,
      amount: allocation.amount.toFixed(2),
    })),
  });

  return withSerializableRetry(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.$queryRaw<Array<{ id: string; requestFingerprint: string }>>`
        SELECT "id"::text AS "id", "requestFingerprint"
        FROM "restaurant_returns"
        WHERE "workspaceId"=${context.workspaceId}::uuid
          AND "idempotencyKey"=${idempotencyKey}
        LIMIT 1
        FOR SHARE
      `;
      if (existing[0]) {
        if (existing[0].requestFingerprint !== requestFingerprint) {
          throw new IndustryDomainError("CONFLICT", "This restaurant return request ID was already used for a different return.");
        }
        return { id: existing[0].id, idempotent: true as const };
      }
    }

    const orders = await tx.$queryRaw<Array<{
      id: string;
      orderNumber: string;
      status: string;
      subtotal: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      total: Prisma.Decimal;
      inventoryPostedAt: Date | null;
      accountingPostedAt: Date | null;
    }>>`
      SELECT "id"::text AS "id", "orderNumber", "status", "subtotal", "discountAmount", "taxAmount", "total",
             "inventoryPostedAt", "accountingPostedAt"
      FROM "restaurant_orders"
      WHERE "id"=${input.orderId}::uuid
        AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new IndustryDomainError("NOT_FOUND", "Restaurant order was not found.");
    if (order.status !== "COMPLETED") {
      throw new IndustryDomainError("INVALID_STATE", "Only completed restaurant orders can have item-level returns.");
    }
    if (!order.accountingPostedAt || !order.inventoryPostedAt) {
      throw new IndustryDomainError("INVALID_STATE", "This restaurant order is not fully posted and cannot be returned safely.");
    }
    if (new Prisma.Decimal(order.subtotal).lte(0)) {
      throw new IndustryDomainError("INVALID_STATE", "A zero-subtotal restaurant order cannot be partially returned.");
    }

    const allItems = await tx.$queryRaw<Array<OrderItemRow>>`
      SELECT "id"::text AS "id", "itemName", "quantity", "lineTotal"
      FROM "restaurant_order_items"
      WHERE "restaurantOrderId"=${order.id}::uuid
      ORDER BY "createdAt", "id"
      FOR UPDATE
    `;
    const itemById = new Map(allItems.map((item) => [item.id, item]));
    for (const requested of normalizedItems) {
      if (!itemById.has(requested.orderItemId)) {
        throw new IndustryDomainError("NOT_FOUND", "A selected restaurant order item does not belong to this order.");
      }
    }

    const priorQuantities = await tx.$queryRaw<Array<{ restaurantOrderItemId: string; quantity: Prisma.Decimal }>>`
      SELECT rri."restaurantOrderItemId"::text AS "restaurantOrderItemId", COALESCE(SUM(rri."quantity"), 0)::numeric AS "quantity"
      FROM "restaurant_return_items" rri
      INNER JOIN "restaurant_returns" rr ON rr."id"=rri."restaurantReturnId"
      WHERE rr."workspaceId"=${context.workspaceId}::uuid
        AND rr."restaurantOrderId"=${order.id}::uuid
      GROUP BY rri."restaurantOrderItemId"
    `;
    const priorByItem = new Map(priorQuantities.map((row) => [row.restaurantOrderItemId, new Prisma.Decimal(row.quantity)]));

    const requestedByItem = new Map(normalizedItems.map((item) => [item.orderItemId, item]));
    for (const requested of normalizedItems) {
      const original = itemById.get(requested.orderItemId)!;
      const prior = priorByItem.get(requested.orderItemId) ?? ZERO;
      if (prior.plus(requested.quantity).gt(original.quantity)) {
        throw new IndustryDomainError("INVALID_STATE", `Return quantity exceeds the remaining quantity for ${original.itemName}.`);
      }
    }

    const priorTotals = await tx.$queryRaw<Array<{
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      total: Prisma.Decimal;
    }>>`
      SELECT COALESCE(SUM("discountAmount"), 0)::numeric AS "discountAmount",
             COALESCE(SUM("taxAmount"), 0)::numeric AS "taxAmount",
             COALESCE(SUM("total"), 0)::numeric AS "total"
      FROM "restaurant_returns"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "restaurantOrderId"=${order.id}::uuid
    `;
    const priorDiscount = new Prisma.Decimal(priorTotals[0]?.discountAmount ?? 0);
    const priorTax = new Prisma.Decimal(priorTotals[0]?.taxAmount ?? 0);

    const lines: CalculatedLine[] = normalizedItems.map((requested) => {
      const original = itemById.get(requested.orderItemId)!;
      const ratio = requested.quantity.div(original.quantity);
      const lineSubtotal = money(new Prisma.Decimal(original.lineTotal).mul(ratio));
      const orderRatio = lineSubtotal.div(order.subtotal);
      const discountAmount = money(new Prisma.Decimal(order.discountAmount).mul(orderRatio));
      const taxAmount = money(new Prisma.Decimal(order.taxAmount).mul(orderRatio));
      return {
        orderItemId: requested.orderItemId,
        itemName: original.itemName,
        originalQuantity: new Prisma.Decimal(original.quantity),
        returnQuantity: requested.quantity,
        restock: requested.restock,
        subtotal: lineSubtotal,
        discountAmount,
        taxAmount,
        total: money(lineSubtotal.minus(discountAmount).plus(taxAmount)),
        inventoryCost: ZERO,
      };
    });

    const exhaustsOrder = allItems.every((original) => {
      const prior = priorByItem.get(original.id) ?? ZERO;
      const requested = requestedByItem.get(original.id)?.quantity ?? ZERO;
      return prior.plus(requested).equals(original.quantity);
    });

    let returnSubtotal = money(lines.reduce((sum, line) => sum.plus(line.subtotal), ZERO));
    let returnDiscount = money(lines.reduce((sum, line) => sum.plus(line.discountAmount), ZERO));
    let returnTax = money(lines.reduce((sum, line) => sum.plus(line.taxAmount), ZERO));
    if (exhaustsOrder && lines.length) {
      const targetDiscount = money(new Prisma.Decimal(order.discountAmount).minus(priorDiscount));
      const targetTax = money(new Prisma.Decimal(order.taxAmount).minus(priorTax));
      const last = lines[lines.length - 1]!;
      last.discountAmount = money(last.discountAmount.plus(targetDiscount.minus(returnDiscount)));
      last.taxAmount = money(last.taxAmount.plus(targetTax.minus(returnTax)));
      last.total = money(last.subtotal.minus(last.discountAmount).plus(last.taxAmount));
      returnDiscount = targetDiscount;
      returnTax = targetTax;
    }
    const returnTotal = money(returnSubtotal.minus(returnDiscount).plus(returnTax));
    if (returnTotal.lte(0)) {
      throw new IndustryDomainError("INVALID_STATE", "The calculated restaurant return amount must be greater than zero.");
    }

    const allocationTotal = money(normalizedAllocations.reduce((sum, allocation) => sum.plus(allocation.amount), ZERO));
    if (!allocationTotal.equals(returnTotal)) {
      throw new IndustryDomainError(
        "INVALID_STATE",
        `Refund allocations must exactly equal the restaurant return total of ${returnTotal.toFixed(2)}.`,
      );
    }

    const payments = await tx.$queryRaw<Array<{
      id: string;
      amount: Prisma.Decimal;
      cashBankAccountId: string;
      postedAt: Date | null;
      voidedAt: Date | null;
    }>>(Prisma.sql`
      SELECT "id"::text AS "id", "amount", "cashBankAccountId", "postedAt", "voidedAt"
      FROM "restaurant_payments"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "restaurantOrderId"=${order.id}::uuid
        AND "id" IN (${buildInList(paymentIds)})
      ORDER BY "id"
      FOR UPDATE
    `);
    if (payments.length !== paymentIds.length) {
      throw new IndustryDomainError("NOT_FOUND", "One or more restaurant payments were not found on this order.");
    }
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]));

    const priorAllocations = await tx.$queryRaw<Array<{ restaurantPaymentId: string; amount: Prisma.Decimal }>>(Prisma.sql`
      SELECT "restaurantPaymentId"::text AS "restaurantPaymentId", COALESCE(SUM("amount"), 0)::numeric AS "amount"
      FROM "restaurant_return_payment_allocations"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "restaurantPaymentId" IN (${buildInList(paymentIds)})
      GROUP BY "restaurantPaymentId"
    `);
    const priorAllocationByPayment = new Map(
      priorAllocations.map((row) => [row.restaurantPaymentId, new Prisma.Decimal(row.amount)]),
    );

    const fullRefunds = await tx.$queryRaw<Array<{ restaurantPaymentId: string }>>(Prisma.sql`
      SELECT "restaurantPaymentId"::text AS "restaurantPaymentId"
      FROM "restaurant_refunds"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "restaurantPaymentId" IN (${buildInList(paymentIds)})
      FOR SHARE
    `);
    if (fullRefunds.length) {
      throw new IndustryDomainError("INVALID_STATE", "A selected restaurant payment has already been fully refunded.");
    }

    const cashNeeded = new Map<string, Prisma.Decimal>();
    for (const allocation of normalizedAllocations) {
      const payment = paymentById.get(allocation.paymentId)!;
      if (!payment.postedAt || payment.voidedAt) {
        throw new IndustryDomainError("INVALID_STATE", "Only active posted restaurant payments can fund an item return.");
      }
      const prior = priorAllocationByPayment.get(payment.id) ?? ZERO;
      const available = money(new Prisma.Decimal(payment.amount).minus(prior));
      if (allocation.amount.gt(available)) {
        throw new IndustryDomainError("INVALID_STATE", "A restaurant refund allocation exceeds the unrefunded payment amount.");
      }
      cashNeeded.set(
        payment.cashBankAccountId,
        (cashNeeded.get(payment.cashBankAccountId) ?? ZERO).plus(allocation.amount),
      );
    }

    const cashAccounts = await tx.cashBankAccount.findMany({
      where: { id: { in: [...cashNeeded.keys()] }, workspaceId: context.workspaceId },
      include: { account: true },
    });
    const cashById = new Map(cashAccounts.map((account) => [account.id, account]));
    for (const [cashBankAccountId, needed] of cashNeeded) {
      const account = cashById.get(cashBankAccountId);
      if (!account) throw new IndustryDomainError("NOT_FOUND", "An original restaurant cash or bank account is unavailable.");
      if (new Prisma.Decimal(account.currentBalance).lt(needed)) {
        throw new IndustryDomainError(
          "INVALID_STATE",
          "An original cash or bank account does not have enough recorded balance to fund this return.",
        );
      }
    }

    const returnId = randomUUID();
    const returnNumber = `RR-${order.orderNumber}-${returnId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;

    await tx.$executeRaw`
      INSERT INTO "restaurant_returns" (
        "id", "workspaceId", "restaurantOrderId", "returnNumber", "reason",
        "subtotal", "discountAmount", "taxAmount", "total", "inventoryCost",
        "idempotencyKey", "requestFingerprint", "createdById"
      ) VALUES (
        ${returnId}::uuid, ${context.workspaceId}::uuid, ${order.id}::uuid, ${returnNumber}, ${reason},
        ${returnSubtotal}, ${returnDiscount}, ${returnTax}, ${returnTotal}, 0,
        ${idempotencyKey}, ${requestFingerprint}, ${context.userId ?? null}
      )
    `;

    let totalInventoryCost = ZERO;
    for (const line of lines) {
      let lineInventoryCost = ZERO;
      if (line.restock) {
        const consumptions = await tx.$queryRaw<Array<{
          productId: string;
          warehouseId: string | null;
          quantity: Prisma.Decimal;
          unitCost: Prisma.Decimal;
        }>>`
          SELECT "productId", "warehouseId"::text AS "warehouseId", "quantity", "unitCost"
          FROM "restaurant_inventory_consumptions"
          WHERE "workspaceId"=${context.workspaceId}::uuid
            AND "restaurantOrderId"=${order.id}::uuid
            AND "restaurantOrderItemId"=${line.orderItemId}::uuid
          ORDER BY "productId"
          FOR SHARE
        `;
        if (!consumptions.length) {
          throw new IndustryDomainError(
            "INVALID_STATE",
            "This historical order has no item-level inventory snapshot. Restocking is blocked rather than estimated. Return it without restocking.",
          );
        }

        const fraction = line.returnQuantity.div(line.originalQuantity);
        for (const consumption of consumptions) {
          const restoreQuantity = quantity(new Prisma.Decimal(consumption.quantity).mul(fraction));
          if (restoreQuantity.lte(0)) continue;

          const product = await tx.product.findFirst({
            where: { id: consumption.productId, workspaceId: context.workspaceId },
            select: { id: true },
          });
          if (!product) {
            throw new IndustryDomainError("NOT_FOUND", "A historically consumed restaurant product no longer exists.");
          }

          await tx.product.update({
            where: { id: product.id, workspaceId: context.workspaceId },
            data: { stockQuantity: { increment: restoreQuantity } },
          });
          if (consumption.warehouseId) {
            try {
              await applyManagedWarehouseStockDelta(tx, {
                workspaceId: context.workspaceId,
                warehouseId: consumption.warehouseId,
                productId: product.id,
                delta: restoreQuantity,
              });
            } catch (error) {
              if (error instanceof ManagedWarehouseStockError) {
                throw new IndustryDomainError("INVALID_STATE", error.message);
              }
              throw error;
            }
          }

          await tx.inventoryTransaction.create({
            data: {
              workspaceId: context.workspaceId,
              productId: product.id,
              type: "ADJUSTMENT",
              quantityChanged: restoreQuantity,
              unitCost: consumption.unitCost,
              reference: `RESTAURANT_RETURN:${returnId}`,
            },
          });
          lineInventoryCost = lineInventoryCost.plus(restoreQuantity.mul(consumption.unitCost));
        }
      }

      line.inventoryCost = money(lineInventoryCost);
      totalInventoryCost = totalInventoryCost.plus(line.inventoryCost);
      await tx.$executeRaw`
        INSERT INTO "restaurant_return_items" (
          "workspaceId", "restaurantReturnId", "restaurantOrderItemId", "quantity",
          "subtotal", "discountAmount", "taxAmount", "total", "inventoryCost", "restocked"
        ) VALUES (
          ${context.workspaceId}::uuid, ${returnId}::uuid, ${line.orderItemId}::uuid, ${line.returnQuantity},
          ${line.subtotal}, ${line.discountAmount}, ${line.taxAmount}, ${line.total}, ${line.inventoryCost}, ${line.restock}
        )
      `;
    }
    totalInventoryCost = money(totalInventoryCost);

    await tx.$executeRaw`
      UPDATE "restaurant_returns"
      SET "inventoryCost"=${totalInventoryCost}
      WHERE "id"=${returnId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;

    await postCustomerReturnToGeneralLedger(tx, {
      workspaceId: context.workspaceId,
      returnId,
      documentNo: returnNumber,
      date: new Date(),
      amount: returnTotal,
      salesTax: returnTax,
      inventoryCost: totalInventoryCost,
    });

    const receivable = await tx.account.findUnique({
      where: { workspaceId_systemCode: { workspaceId: context.workspaceId, systemCode: "ACCOUNTS_RECEIVABLE" } },
      select: { id: true },
    });
    if (!receivable) throw new IndustryDomainError("INVALID_STATE", "Accounts receivable system account is unavailable.");

    const now = new Date();
    for (const allocation of normalizedAllocations) {
      const payment = paymentById.get(allocation.paymentId)!;
      const cashBank = cashById.get(payment.cashBankAccountId)!;
      await tx.generalLedgerEntry.createMany({
        data: [
          {
            workspaceId: context.workspaceId,
            accountId: receivable.id,
            sourceType: "CUSTOMER_RETURN",
            sourceId: returnId,
            documentNo: returnNumber,
            date: now,
            narration: `Restaurant cash refund ${returnNumber}`,
            debit: allocation.amount,
            credit: 0,
          },
          {
            workspaceId: context.workspaceId,
            accountId: cashBank.accountId,
            sourceType: "CUSTOMER_RETURN",
            sourceId: returnId,
            documentNo: returnNumber,
            date: now,
            narration: `Restaurant cash refund ${returnNumber}`,
            debit: 0,
            credit: allocation.amount,
          },
        ],
      });
      await tx.cashBankAccount.update({
        where: { id: cashBank.id, workspaceId: context.workspaceId },
        data: { currentBalance: { decrement: allocation.amount } },
      });
      await tx.$executeRaw`
        INSERT INTO "restaurant_return_payment_allocations" (
          "workspaceId", "restaurantReturnId", "restaurantPaymentId", "amount"
        ) VALUES (
          ${context.workspaceId}::uuid, ${returnId}::uuid, ${payment.id}::uuid, ${allocation.amount}
        )
      `;

      const prior = priorAllocationByPayment.get(payment.id) ?? ZERO;
      if (money(prior.plus(allocation.amount)).equals(money(payment.amount))) {
        await tx.$executeRaw`
          UPDATE "restaurant_payments"
          SET "voidedAt"=${now},
              "voidedById"=${context.userId ?? null},
              "voidReason"=${`Fully refunded through restaurant item returns (${returnNumber})`}
          WHERE "id"=${payment.id}::uuid
            AND "workspaceId"=${context.workspaceId}::uuid
            AND "voidedAt" IS NULL
        `;
      }
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.return.created",
      entityType: "RestaurantReturn",
      entityId: returnId,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        returnNumber,
        reason,
        subtotal: returnSubtotal.toFixed(2),
        discountAmount: returnDiscount.toFixed(2),
        taxAmount: returnTax.toFixed(2),
        total: returnTotal.toFixed(2),
        inventoryCost: totalInventoryCost.toFixed(2),
        items: lines.map((line) => ({
          orderItemId: line.orderItemId,
          quantity: line.returnQuantity.toFixed(4),
          restocked: line.restock,
        })),
        paymentAllocations: normalizedAllocations.map((allocation) => ({
          paymentId: allocation.paymentId,
          amount: allocation.amount.toFixed(2),
        })),
      },
    });

    return {
      id: returnId,
      returnNumber,
      total: returnTotal.toNumber(),
      inventoryCost: totalInventoryCost.toNumber(),
      idempotent: false as const,
    };
  });
}

export async function listRestaurantItemReturns(workspaceId: string, orderId?: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  if (orderId) assertUuid(orderId, "Restaurant order");
  const orderFilter = orderId
    ? Prisma.sql`AND rr."restaurantOrderId"=${orderId}::uuid`
    : Prisma.empty;

  const rows = await db.$queryRaw<Array<{
    id: string;
    restaurantOrderId: string;
    returnNumber: string;
    reason: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    total: Prisma.Decimal;
    inventoryCost: Prisma.Decimal;
    createdAt: Date;
  }>>(Prisma.sql`
    SELECT rr."id"::text AS "id", rr."restaurantOrderId"::text AS "restaurantOrderId",
           rr."returnNumber", rr."reason", rr."subtotal", rr."discountAmount", rr."taxAmount",
           rr."total", rr."inventoryCost", rr."createdAt"
    FROM "restaurant_returns" rr
    WHERE rr."workspaceId"=${workspaceId}::uuid
      ${orderFilter}
    ORDER BY rr."createdAt" DESC, rr."id" DESC
  `);

  return rows.map((row) => ({
    ...row,
    subtotal: Number(row.subtotal),
    discountAmount: Number(row.discountAmount),
    taxAmount: Number(row.taxAmount),
    total: Number(row.total),
    inventoryCost: Number(row.inventoryCost),
  }));
}
