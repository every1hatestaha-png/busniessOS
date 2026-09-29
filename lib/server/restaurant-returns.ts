import "server-only";

import { Prisma } from "@prisma/client";

import { ensureDefaultAccounts } from "@/lib/server/accounting";
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

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new IndustryDomainError("INVALID_STATE", `${label} is invalid.`);
}

function assertManager(context: IndustryContext) {
  if (!MANAGER_ROLES.has(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Manager access is required for restaurant item returns.");
  }
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

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export type RestaurantItemReturnInput = {
  orderId: string;
  reason: string;
  idempotencyKey?: string;
  cashBankAccountId?: string;
  lines: Array<{ orderItemId: string; quantity: number }>;
};

export async function returnRestaurantItems(context: IndustryContext, input: RestaurantItemReturnInput) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(input.orderId, "Restaurant order");
  const reason = cleanReason(input.reason);
  const idempotencyKey = cleanIdempotencyKey(input.idempotencyKey);
  if (input.cashBankAccountId) assertUuid(input.cashBankAccountId, "Cash or bank account");
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) {
    throw new IndustryDomainError("INVALID_STATE", "Return between 1 and 100 restaurant order lines.");
  }
  const requested = new Map<string, Prisma.Decimal>();
  for (const line of input.lines) {
    assertUuid(line.orderItemId, "Restaurant order item");
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new IndustryDomainError("INVALID_STATE", "Returned quantity must be positive.");
    }
    const qty = new Prisma.Decimal(line.quantity);
    requested.set(line.orderItemId, (requested.get(line.orderItemId) ?? new Prisma.Decimal(0)).plus(qty));
  }

  return withSerializableRetry(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.$queryRaw<Array<{ id: string; restaurantOrderId: string }>>`
        SELECT "id"::text AS "id", "restaurantOrderId"::text AS "restaurantOrderId"
        FROM "restaurant_item_returns"
        WHERE "workspaceId"=${context.workspaceId}::uuid AND "idempotencyKey"=${idempotencyKey}
        LIMIT 1 FOR SHARE
      `;
      if (existing[0]) {
        if (existing[0].restaurantOrderId !== input.orderId) {
          throw new IndustryDomainError("CONFLICT", "This restaurant return request ID was already used for another order.");
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
      returnedAmount: Prisma.Decimal;
      returnedTaxAmount: Prisma.Decimal;
      returnedInventoryCost: Prisma.Decimal;
      inventoryPostedAt: Date | null;
      accountingPostedAt: Date | null;
    }>>`
      SELECT "id"::text AS "id", "orderNumber", "status", "subtotal", "discountAmount", "taxAmount", "total",
             "returnedAmount", "returnedTaxAmount", "returnedInventoryCost", "inventoryPostedAt", "accountingPostedAt"
      FROM "restaurant_orders"
      WHERE "id"=${input.orderId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new IndustryDomainError("NOT_FOUND", "Restaurant order was not found.");
    if (order.status !== "COMPLETED" || !order.inventoryPostedAt || !order.accountingPostedAt) {
      throw new IndustryDomainError("INVALID_STATE", "Only fully posted completed restaurant orders can be returned.");
    }
    if (order.subtotal.lte(0)) throw new IndustryDomainError("INVALID_STATE", "Restaurant order subtotal is invalid for returns.");

    const itemIds = [...requested.keys()];
    const items = await tx.$queryRaw<Array<{
      id: string;
      quantity: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>>`
      SELECT roi."id"::text AS "id", roi."quantity", roi."lineTotal"
      FROM "restaurant_order_items" roi
      INNER JOIN "restaurant_orders" ro ON ro."id"=roi."restaurantOrderId"
      WHERE ro."workspaceId"=${context.workspaceId}::uuid
        AND ro."id"=${input.orderId}::uuid
        AND roi."id" = ANY(${itemIds}::uuid[])
      FOR UPDATE OF roi
    `;
    if (items.length !== itemIds.length) {
      throw new IndustryDomainError("NOT_FOUND", "One or more restaurant order items were not found in this order.");
    }

    const prior = await tx.$queryRaw<Array<{ restaurantOrderItemId: string; quantity: Prisma.Decimal }>>`
      SELECT rirl."restaurantOrderItemId"::text AS "restaurantOrderItemId", COALESCE(SUM(rirl."quantity"),0)::numeric AS "quantity"
      FROM "restaurant_item_return_lines" rirl
      INNER JOIN "restaurant_item_returns" rir ON rir."id"=rirl."restaurantItemReturnId"
      WHERE rir."workspaceId"=${context.workspaceId}::uuid
        AND rir."restaurantOrderId"=${input.orderId}::uuid
        AND rirl."restaurantOrderItemId" = ANY(${itemIds}::uuid[])
      GROUP BY rirl."restaurantOrderItemId"
    `;
    const priorByItem = new Map(prior.map((row) => [row.restaurantOrderItemId, new Prisma.Decimal(row.quantity)]));

    let revenueReturn = new Prisma.Decimal(0);
    let taxReturn = new Prisma.Decimal(0);
    let inventoryCost = new Prisma.Decimal(0);
    const returnLines: Array<{
      itemId: string;
      quantity: Prisma.Decimal;
      subtotalAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      inventoryCost: Prisma.Decimal;
    }> = [];
    const stockRestores: Array<{
      itemId: string;
      productId: string;
      warehouseId: string | null;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
    }> = [];

    for (const item of items) {
      const quantity = requested.get(item.id)!;
      const alreadyReturned = priorByItem.get(item.id) ?? new Prisma.Decimal(0);
      if (alreadyReturned.plus(quantity).gt(item.quantity)) {
        throw new IndustryDomainError("INVALID_STATE", "Returned quantity cannot exceed the quantity originally sold.");
      }
      const ratio = quantity.div(item.quantity);
      const grossReturned = new Prisma.Decimal(item.lineTotal).mul(ratio);
      const discountShare = order.discountAmount.mul(grossReturned).div(order.subtotal);
      const lineRevenue = money(grossReturned.minus(discountShare));
      const lineTax = money(order.taxAmount.mul(grossReturned).div(order.subtotal));

      const consumptions = await tx.$queryRaw<Array<{
        productId: string;
        warehouseId: string | null;
        quantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
      }>>`
        SELECT "productId", "warehouseId"::text AS "warehouseId", "quantity", "unitCost"
        FROM "restaurant_order_item_consumptions"
        WHERE "workspaceId"=${context.workspaceId}::uuid
          AND "restaurantOrderId"=${input.orderId}::uuid
          AND "restaurantOrderItemId"=${item.id}::uuid
        FOR SHARE
      `;
      if (!consumptions.length) {
        throw new IndustryDomainError(
          "INVALID_STATE",
          "This order item has no historical consumption snapshot, so stock restoration cannot be calculated safely.",
        );
      }
      let lineCost = new Prisma.Decimal(0);
      for (const consumption of consumptions) {
        const restoreQty = new Prisma.Decimal(consumption.quantity).mul(ratio).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        if (restoreQty.lte(0)) continue;
        const unitCost = new Prisma.Decimal(consumption.unitCost);
        lineCost = lineCost.plus(restoreQty.mul(unitCost));
        stockRestores.push({
          itemId: item.id,
          productId: consumption.productId,
          warehouseId: consumption.warehouseId,
          quantity: restoreQty,
          unitCost,
        });
      }
      lineCost = money(lineCost);
      revenueReturn = revenueReturn.plus(lineRevenue);
      taxReturn = taxReturn.plus(lineTax);
      inventoryCost = inventoryCost.plus(lineCost);
      returnLines.push({ itemId: item.id, quantity, subtotalAmount: lineRevenue, taxAmount: lineTax, inventoryCost: lineCost });
    }

    revenueReturn = money(revenueReturn);
    taxReturn = money(taxReturn);
    inventoryCost = money(inventoryCost);
    const totalReturn = money(revenueReturn.plus(taxReturn));
    if (new Prisma.Decimal(order.returnedAmount).plus(revenueReturn).gt(order.subtotal.minus(order.discountAmount).plus(0.01))) {
      throw new IndustryDomainError("INVALID_STATE", "Restaurant return revenue would exceed the original sale value.");
    }
    if (new Prisma.Decimal(order.returnedTaxAmount).plus(taxReturn).gt(order.taxAmount.plus(0.01))) {
      throw new IndustryDomainError("INVALID_STATE", "Restaurant return tax would exceed the original tax value.");
    }

    const activePayments = await tx.$queryRaw<Array<{ total: Prisma.Decimal }>>`
      SELECT COALESCE(SUM("amount"),0)::numeric AS "total"
      FROM "restaurant_payments"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "restaurantOrderId"=${input.orderId}::uuid
        AND "voidedAt" IS NULL
    `;
    const priorItemRefunds = await tx.$queryRaw<Array<{ total: Prisma.Decimal }>>`
      SELECT COALESCE(SUM("refundAmount"),0)::numeric AS "total"
      FROM "restaurant_item_returns"
      WHERE "workspaceId"=${context.workspaceId}::uuid AND "restaurantOrderId"=${input.orderId}::uuid
    `;
    const paidAvailable = new Prisma.Decimal(activePayments[0]?.total ?? 0)
      .minus(new Prisma.Decimal(priorItemRefunds[0]?.total ?? 0));
    const refundAmount = Prisma.Decimal.min(totalReturn, Prisma.Decimal.max(paidAvailable, 0)).toDecimalPlaces(2);

    let cashBank: { id: string; accountId: string; currentBalance: Prisma.Decimal } | null = null;
    if (refundAmount.gt(0)) {
      if (!input.cashBankAccountId) {
        throw new IndustryDomainError("INVALID_STATE", "Choose a cash or bank account for the paid portion of this return.");
      }
      cashBank = await tx.cashBankAccount.findFirst({
        where: { id: input.cashBankAccountId, workspaceId: context.workspaceId, isActive: true },
        select: { id: true, accountId: true, currentBalance: true },
      });
      if (!cashBank) throw new IndustryDomainError("NOT_FOUND", "Return cash or bank account was not found in this workspace.");
      if (new Prisma.Decimal(cashBank.currentBalance).lt(refundAmount)) {
        throw new IndustryDomainError("INVALID_STATE", "The selected cash or bank account does not have enough recorded balance for this refund.");
      }
    }

    const created = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_item_returns" (
        "workspaceId", "restaurantOrderId", "cashBankAccountId", "subtotalAmount", "taxAmount", "refundAmount",
        "inventoryCost", "reason", "idempotencyKey", "createdById"
      ) VALUES (
        ${context.workspaceId}::uuid, ${input.orderId}::uuid, ${cashBank?.id ?? null}, ${revenueReturn}, ${taxReturn}, ${refundAmount},
        ${inventoryCost}, ${reason}, ${idempotencyKey}, ${context.userId ?? null}
      ) RETURNING "id"::text AS "id"
    `;
    const itemReturn = created[0]!;

    for (const line of returnLines) {
      await tx.$executeRaw`
        INSERT INTO "restaurant_item_return_lines" (
          "restaurantItemReturnId", "restaurantOrderItemId", "quantity", "subtotalAmount", "taxAmount", "inventoryCost"
        ) VALUES (${itemReturn.id}::uuid, ${line.itemId}::uuid, ${line.quantity}, ${line.subtotalAmount}, ${line.taxAmount}, ${line.inventoryCost})
      `;
    }

    for (const restore of stockRestores) {
      const product = await tx.product.findFirst({
        where: { id: restore.productId, workspaceId: context.workspaceId },
        select: { id: true },
      });
      if (!product) throw new IndustryDomainError("NOT_FOUND", "A historical restaurant ingredient no longer exists in this workspace.");
      await tx.product.update({
        where: { id: restore.productId, workspaceId: context.workspaceId },
        data: { stockQuantity: { increment: restore.quantity } },
      });
      if (restore.warehouseId) {
        try {
          await applyManagedWarehouseStockDelta(tx, {
            workspaceId: context.workspaceId,
            warehouseId: restore.warehouseId,
            productId: restore.productId,
            delta: restore.quantity,
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
          productId: restore.productId,
          type: "RETURN_IN",
          quantityChanged: restore.quantity,
          unitCost: restore.unitCost,
          reference: `RESTAURANT_RETURN:${itemReturn.id}:${restore.itemId}`,
        },
      });
    }

    await ensureDefaultAccounts(context.workspaceId, tx);
    const accounts = await tx.account.findMany({
      where: {
        workspaceId: context.workspaceId,
        systemCode: { in: ["ACCOUNTS_RECEIVABLE", "SALES_REVENUE", "SALES_TAX_PAYABLE", "INVENTORY", "COST_OF_GOODS_SOLD"] },
      },
      select: { id: true, systemCode: true },
    });
    const account = new Map(accounts.map((a) => [a.systemCode, a.id]));
    const required = ["ACCOUNTS_RECEIVABLE", "SALES_REVENUE", "SALES_TAX_PAYABLE", "INVENTORY", "COST_OF_GOODS_SOLD"] as const;
    for (const code of required) if (!account.get(code)) throw new IndustryDomainError("INVALID_STATE", `Missing accounting account ${code}.`);

    const documentNo = `RR-${order.orderNumber}-${itemReturn.id.slice(0, 8).toUpperCase()}`;
    const now = new Date();
    const entries: Prisma.GeneralLedgerEntryCreateManyInput[] = [
      { workspaceId: context.workspaceId, accountId: account.get("SALES_REVENUE")!, sourceType: "ADJUSTMENT", sourceId: itemReturn.id, documentNo, date: now, narration: `Restaurant item return ${order.orderNumber}`, debit: revenueReturn, credit: 0 },
      { workspaceId: context.workspaceId, accountId: account.get("ACCOUNTS_RECEIVABLE")!, sourceType: "ADJUSTMENT", sourceId: itemReturn.id, documentNo, date: now, narration: `Restaurant item return ${order.orderNumber}`, debit: 0, credit: totalReturn },
    ];
    if (taxReturn.gt(0)) {
      entries.push({ workspaceId: context.workspaceId, accountId: account.get("SALES_TAX_PAYABLE")!, sourceType: "ADJUSTMENT", sourceId: itemReturn.id, documentNo, date: now, narration: `Restaurant tax return ${order.orderNumber}`, debit: taxReturn, credit: 0 });
    }
    if (inventoryCost.gt(0)) {
      entries.push(
        { workspaceId: context.workspaceId, accountId: account.get("INVENTORY")!, sourceType: "ADJUSTMENT", sourceId: itemReturn.id, documentNo, date: now, narration: `Restaurant inventory returned ${order.orderNumber}`, debit: inventoryCost, credit: 0 },
        { workspaceId: context.workspaceId, accountId: account.get("COST_OF_GOODS_SOLD")!, sourceType: "ADJUSTMENT", sourceId: itemReturn.id, documentNo, date: now, narration: `Restaurant COGS reversed ${order.orderNumber}`, debit: 0, credit: inventoryCost },
      );
    }
    if (refundAmount.gt(0) && cashBank) {
      entries.push(
        { workspaceId: context.workspaceId, accountId: account.get("ACCOUNTS_RECEIVABLE")!, sourceType: "ADJUSTMENT", sourceId: itemReturn.id, documentNo, date: now, narration: `Restaurant cash refund ${order.orderNumber}`, debit: refundAmount, credit: 0 },
        { workspaceId: context.workspaceId, accountId: cashBank.accountId, sourceType: "ADJUSTMENT", sourceId: itemReturn.id, documentNo, date: now, narration: `Restaurant cash refund ${order.orderNumber}`, debit: 0, credit: refundAmount },
      );
      await tx.cashBankAccount.update({
        where: { id: cashBank.id, workspaceId: context.workspaceId },
        data: { currentBalance: { decrement: refundAmount } },
      });
    }
    const debits = entries.reduce((sum, e) => sum.plus(new Prisma.Decimal(e.debit?.toString() ?? 0)), new Prisma.Decimal(0));
    const credits = entries.reduce((sum, e) => sum.plus(new Prisma.Decimal(e.credit?.toString() ?? 0)), new Prisma.Decimal(0));
    if (!debits.equals(credits)) throw new IndustryDomainError("INVALID_STATE", "Restaurant return accounting is not balanced.");
    await tx.generalLedgerEntry.createMany({ data: entries });

    await tx.$executeRaw`
      UPDATE "restaurant_orders"
      SET "returnedAmount"="returnedAmount"+${revenueReturn},
          "returnedTaxAmount"="returnedTaxAmount"+${taxReturn},
          "returnedInventoryCost"="returnedInventoryCost"+${inventoryCost},
          "updatedAt"=now()
      WHERE "id"=${input.orderId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.items.returned",
      entityType: "RestaurantItemReturn",
      entityId: itemReturn.id,
      metadata: {
        orderId: input.orderId,
        orderNumber: order.orderNumber,
        revenueReturned: revenueReturn.toFixed(2),
        taxReturned: taxReturn.toFixed(2),
        inventoryCostReturned: inventoryCost.toFixed(2),
        cashRefunded: refundAmount.toFixed(2),
        lines: returnLines.length,
        reason,
      },
    });

    return {
      id: itemReturn.id,
      idempotent: false as const,
      revenueReturned: Number(revenueReturn),
      taxReturned: Number(taxReturn),
      inventoryCostReturned: Number(inventoryCost),
      cashRefunded: Number(refundAmount),
    };
  });
}

export async function listRestaurantItemReturns(workspaceId: string, orderId?: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  if (orderId) assertUuid(orderId, "Restaurant order");
  const filter = orderId ? Prisma.sql`AND rir."restaurantOrderId"=${orderId}::uuid` : Prisma.empty;
  const rows = await db.$queryRaw<Array<{
    id: string; restaurantOrderId: string; subtotalAmount: Prisma.Decimal; taxAmount: Prisma.Decimal;
    refundAmount: Prisma.Decimal; inventoryCost: Prisma.Decimal; reason: string; createdAt: Date;
  }>>`
    SELECT rir."id"::text AS "id", rir."restaurantOrderId"::text AS "restaurantOrderId", rir."subtotalAmount", rir."taxAmount",
           rir."refundAmount", rir."inventoryCost", rir."reason", rir."createdAt"
    FROM "restaurant_item_returns" rir
    WHERE rir."workspaceId"=${workspaceId}::uuid ${filter}
    ORDER BY rir."createdAt" DESC
    LIMIT 500
  `;
  return rows.map((row) => ({
    ...row,
    subtotalAmount: Number(row.subtotalAmount),
    taxAmount: Number(row.taxAmount),
    refundAmount: Number(row.refundAmount),
    inventoryCost: Number(row.inventoryCost),
  }));
}
