import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";
import { IndustryDomainError, requireWorkspaceModule, type IndustryContext } from "@/lib/server/industry-modules";
import { applyManagedWarehouseStockDelta, ManagedWarehouseStockError } from "@/lib/server/managed-warehouse-stock";
import { withSerializableRetry } from "@/lib/server/tx-retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGER_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new IndustryDomainError("INVALID_STATE", `${label} is invalid.`);
}

function assertManager(context: IndustryContext) {
  if (!MANAGER_ROLES.has(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Manager access is required to reverse restaurant returns.");
  }
}

function cleanReason(value: string) {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new IndustryDomainError("INVALID_STATE", "Provide a reversal reason between 3 and 500 characters.");
  }
  return reason;
}

function quantity(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

export async function reverseRestaurantItemReturn(
  context: IndustryContext,
  restaurantReturnId: string,
  reasonInput: string,
) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(restaurantReturnId, "Restaurant return");
  const reason = cleanReason(reasonInput);

  return withSerializableRetry(async (tx) => {
    const rows = await tx.$queryRaw<Array<{
      id: string;
      restaurantOrderId: string;
      returnNumber: string;
      reason: string;
      subtotal: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      total: Prisma.Decimal;
      inventoryCost: Prisma.Decimal;
      isReversal: boolean;
    }>>`
      SELECT "id"::text AS "id", "restaurantOrderId"::text AS "restaurantOrderId", "returnNumber", "reason",
             "subtotal", "discountAmount", "taxAmount", "total", "inventoryCost", "isReversal"
      FROM "restaurant_returns"
      WHERE "id"=${restaurantReturnId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const original = rows[0];
    if (!original) throw new IndustryDomainError("NOT_FOUND", "Restaurant return was not found.");
    if (original.isReversal) {
      throw new IndustryDomainError("INVALID_STATE", "A restaurant return reversal cannot itself be reversed through this workflow.");
    }

    const existing = await tx.$queryRaw<Array<{ id: string; returnNumber: string }>>`
      SELECT "id"::text AS "id", "returnNumber"
      FROM "restaurant_returns"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "reversalOfId"=${original.id}::uuid
      LIMIT 1
      FOR SHARE
    `;
    if (existing[0]) {
      return { id: existing[0].id, returnNumber: existing[0].returnNumber, alreadyReversed: true as const };
    }

    const items = await tx.$queryRaw<Array<{
      restaurantOrderItemId: string;
      quantity: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      total: Prisma.Decimal;
      inventoryCost: Prisma.Decimal;
      restocked: boolean;
      originalOrderQuantity: Prisma.Decimal;
    }>>`
      SELECT rri."restaurantOrderItemId"::text AS "restaurantOrderItemId", rri."quantity", rri."subtotal",
             rri."discountAmount", rri."taxAmount", rri."total", rri."inventoryCost", rri."restocked",
             roi."quantity" AS "originalOrderQuantity"
      FROM "restaurant_return_items" rri
      INNER JOIN "restaurant_order_items" roi ON roi."id"=rri."restaurantOrderItemId"
      WHERE rri."workspaceId"=${context.workspaceId}::uuid
        AND rri."restaurantReturnId"=${original.id}::uuid
        AND rri."isReversal"=false
      ORDER BY rri."createdAt", rri."id"
      FOR SHARE OF rri, roi
    `;
    if (!items.length) {
      throw new IndustryDomainError("INVALID_STATE", "Restaurant return has no item lines and cannot be reversed safely.");
    }

    const allocations = await tx.$queryRaw<Array<{
      restaurantPaymentId: string;
      amount: Prisma.Decimal;
      cashBankAccountId: string;
      postedAt: Date | null;
      voidedAt: Date | null;
      voidReason: string | null;
    }>>`
      SELECT rrpa."restaurantPaymentId"::text AS "restaurantPaymentId", rrpa."amount",
             rp."cashBankAccountId", rp."postedAt", rp."voidedAt", rp."voidReason"
      FROM "restaurant_return_payment_allocations" rrpa
      INNER JOIN "restaurant_payments" rp
        ON rp."id"=rrpa."restaurantPaymentId" AND rp."workspaceId"=rrpa."workspaceId"
      WHERE rrpa."workspaceId"=${context.workspaceId}::uuid
        AND rrpa."restaurantReturnId"=${original.id}::uuid
        AND rrpa."isReversal"=false
      ORDER BY rrpa."createdAt", rrpa."id"
      FOR UPDATE OF rp
    `;
    if (!allocations.length) {
      throw new IndustryDomainError("INVALID_STATE", "Restaurant return has no payment allocations and cannot be reversed safely.");
    }

    const expectedAutoVoidReason = `Fully refunded through restaurant item returns (${original.returnNumber})`;
    for (const allocation of allocations) {
      if (!allocation.postedAt) {
        throw new IndustryDomainError("INVALID_STATE", "An original restaurant payment is no longer posted. Automatic reversal is unsafe.");
      }
      if (allocation.voidedAt) {
        if (allocation.voidReason !== expectedAutoVoidReason) {
          throw new IndustryDomainError(
            "INVALID_STATE",
            "An original restaurant payment was voided for another reason. Restore that payment state before reversing this return.",
          );
        }
        await tx.$executeRaw`
          UPDATE "restaurant_payments"
          SET "voidedAt"=NULL, "voidedById"=NULL, "voidReason"=NULL
          WHERE "id"=${allocation.restaurantPaymentId}::uuid
            AND "workspaceId"=${context.workspaceId}::uuid
            AND "voidReason"=${expectedAutoVoidReason}
        `;
      }
    }

    for (const item of items) {
      if (!item.restocked) continue;
      const fraction = new Prisma.Decimal(item.quantity).div(item.originalOrderQuantity);
      const consumptions = await tx.$queryRaw<Array<{
        productId: string;
        warehouseId: string | null;
        quantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
      }>>`
        SELECT "productId", "warehouseId"::text AS "warehouseId", "quantity", "unitCost"
        FROM "restaurant_inventory_consumptions"
        WHERE "workspaceId"=${context.workspaceId}::uuid
          AND "restaurantOrderId"=${original.restaurantOrderId}::uuid
          AND "restaurantOrderItemId"=${item.restaurantOrderItemId}::uuid
        ORDER BY "productId"
        FOR SHARE
      `;
      if (!consumptions.length) {
        throw new IndustryDomainError(
          "INVALID_STATE",
          "Historical inventory consumption is unavailable. Automatic restaurant return reversal is unsafe.",
        );
      }

      for (const consumption of consumptions) {
        const consumeQuantity = quantity(new Prisma.Decimal(consumption.quantity).mul(fraction));
        if (consumeQuantity.lte(0)) continue;
        const products = await tx.$queryRaw<Array<{ id: string; stockQuantity: Prisma.Decimal }>>`
          SELECT "id", "stockQuantity"
          FROM "products"
          WHERE "id"=${consumption.productId} AND "workspaceId"=${context.workspaceId}
          FOR UPDATE
        `;
        const product = products[0];
        if (!product) throw new IndustryDomainError("NOT_FOUND", "A historically restored restaurant product no longer exists.");
        if (new Prisma.Decimal(product.stockQuantity).lt(consumeQuantity)) {
          throw new IndustryDomainError(
            "INVALID_STATE",
            "Restocked inventory from this return has already been consumed. Restore sufficient stock before reversing the return.",
          );
        }

        await tx.product.update({
          where: { id: product.id, workspaceId: context.workspaceId },
          data: { stockQuantity: { decrement: consumeQuantity } },
        });
        if (consumption.warehouseId) {
          try {
            await applyManagedWarehouseStockDelta(tx, {
              workspaceId: context.workspaceId,
              warehouseId: consumption.warehouseId,
              productId: product.id,
              delta: consumeQuantity.negated(),
            });
          } catch (error) {
            if (error instanceof ManagedWarehouseStockError) {
              if (error.code === "NEGATIVE_WAREHOUSE_STOCK") {
                throw new IndustryDomainError(
                  "INVALID_STATE",
                  "Restocked warehouse inventory from this return has already been consumed. Restore sufficient stock before reversing the return.",
                );
              }
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
            quantityChanged: consumeQuantity.negated(),
            unitCost: consumption.unitCost,
            reference: `RESTAURANT_RETURN_REVERSAL:${original.id}`,
          },
        });
      }
    }

    const reversalId = randomUUID();
    const reversalNumber = `REV-${original.returnNumber}-${reversalId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ reversalOfId: original.id, reason }))
      .digest("hex");
    const displayReason = `Reversal of ${original.returnNumber}: ${reason}`.slice(0, 500);

    await tx.$executeRaw`
      INSERT INTO "restaurant_returns" (
        "id", "workspaceId", "restaurantOrderId", "returnNumber", "reason",
        "subtotal", "discountAmount", "taxAmount", "total", "inventoryCost",
        "requestFingerprint", "createdById", "isReversal", "reversalOfId", "reversalReason"
      ) VALUES (
        ${reversalId}::uuid, ${context.workspaceId}::uuid, ${original.restaurantOrderId}::uuid, ${reversalNumber}, ${displayReason},
        ${new Prisma.Decimal(original.subtotal).negated()}, ${new Prisma.Decimal(original.discountAmount).negated()},
        ${new Prisma.Decimal(original.taxAmount).negated()}, ${new Prisma.Decimal(original.total).negated()},
        ${new Prisma.Decimal(original.inventoryCost).negated()}, ${fingerprint}, ${context.userId ?? null}, true,
        ${original.id}::uuid, ${reason}
      )
    `;

    for (const item of items) {
      await tx.$executeRaw`
        INSERT INTO "restaurant_return_items" (
          "workspaceId", "restaurantReturnId", "restaurantOrderItemId", "quantity",
          "subtotal", "discountAmount", "taxAmount", "total", "inventoryCost", "restocked", "isReversal"
        ) VALUES (
          ${context.workspaceId}::uuid, ${reversalId}::uuid, ${item.restaurantOrderItemId}::uuid,
          ${new Prisma.Decimal(item.quantity).negated()}, ${new Prisma.Decimal(item.subtotal).negated()},
          ${new Prisma.Decimal(item.discountAmount).negated()}, ${new Prisma.Decimal(item.taxAmount).negated()},
          ${new Prisma.Decimal(item.total).negated()}, ${new Prisma.Decimal(item.inventoryCost).negated()},
          ${item.restocked}, true
        )
      `;
    }

    const now = new Date();
    await reverseGeneralLedgerEntries(tx, {
      workspaceId: context.workspaceId,
      sources: [{ sourceType: "CUSTOMER_RETURN", sourceId: original.id }],
      documentNo: reversalNumber,
      date: now,
      reason: `Reversed restaurant return ${original.returnNumber}: ${reason}`,
      reversedById: context.userId,
    });

    for (const allocation of allocations) {
      const cashBank = await tx.cashBankAccount.findFirst({
        where: { id: allocation.cashBankAccountId, workspaceId: context.workspaceId },
        select: { id: true },
      });
      if (!cashBank) throw new IndustryDomainError("NOT_FOUND", "An original restaurant cash or bank account no longer exists.");
      await tx.cashBankAccount.update({
        where: { id: cashBank.id, workspaceId: context.workspaceId },
        data: { currentBalance: { increment: allocation.amount } },
      });
      await tx.$executeRaw`
        INSERT INTO "restaurant_return_payment_allocations" (
          "workspaceId", "restaurantReturnId", "restaurantPaymentId", "amount", "isReversal"
        ) VALUES (
          ${context.workspaceId}::uuid, ${reversalId}::uuid, ${allocation.restaurantPaymentId}::uuid,
          ${new Prisma.Decimal(allocation.amount).negated()}, true
        )
      `;
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.return.reversed",
      entityType: "RestaurantReturn",
      entityId: reversalId,
      metadata: {
        reversalOfId: original.id,
        originalReturnNumber: original.returnNumber,
        reversalNumber,
        reason,
        total: original.total.toString(),
        inventoryCost: original.inventoryCost.toString(),
        restockedItems: items.filter((item) => item.restocked).length,
        paymentAllocations: allocations.map((allocation) => ({
          paymentId: allocation.restaurantPaymentId,
          amount: allocation.amount.toString(),
        })),
      },
    });

    return { id: reversalId, returnNumber: reversalNumber, alreadyReversed: false as const };
  });
}
