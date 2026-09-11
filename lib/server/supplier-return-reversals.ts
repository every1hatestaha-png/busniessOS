import "server-only";

import { Prisma } from "@prisma/client";

import { reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { canPerformAction } from "@/lib/server/authorization";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import type { ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";

export class SupplierReturnReversalError extends Error {}

export async function cancelSupplierReturn(context: ServiceContext, supplierReturnId: string, reason: string) {
  if (!canPerformAction(context.role, "financial.manage")) throw new SupplierReturnReversalError("Unauthorized");
  const cleanReason = reason.trim();
  if (cleanReason.length < 3 || cleanReason.length > 500) throw new SupplierReturnReversalError("Provide a cancellation reason between 3 and 500 characters.");

  return withSerializableRetry(async (tx) => {
    const supplierReturn = await tx.supplierReturn.findFirst({
      where: { id: supplierReturnId, workspaceId: context.workspaceId },
      include: {
        items: { select: { id: true, productId: true, quantity: true, totalCost: true } },
        purchaseOrder: { select: { id: true, status: true } },
      },
    });
    if (!supplierReturn) throw new SupplierReturnReversalError("Supplier return not found.");
    if (supplierReturn.status === "CANCELLED") return { id: supplierReturn.id, alreadyCancelled: true as const };
    if (supplierReturn.status !== "POSTED") throw new SupplierReturnReversalError("Only a posted supplier return can be cancelled.");

    // Restore inventory at the exact carrying value removed by the posted return.
    // This is a weighted-average add-back and remains correct even if stock moved
    // after the original return.
    for (const item of supplierReturn.items) {
      if (item.quantity.lte(0)) throw new SupplierReturnReversalError("Supplier return contains an invalid non-positive quantity.");
      const product = await tx.product.findFirst({
        where: { id: item.productId, workspaceId: context.workspaceId },
        select: { id: true, stockQuantity: true, costPrice: true },
      });
      if (!product) throw new SupplierReturnReversalError("A returned product no longer exists in this workspace.");

      const restoredQuantity = product.stockQuantity.plus(item.quantity);
      const restoredValue = product.costPrice.mul(product.stockQuantity).plus(item.totalCost);
      const restoredCost = restoredQuantity.gt(0) ? restoredValue.div(restoredQuantity) : new Prisma.Decimal(0);
      const changed = await tx.product.updateMany({
        where: { id: product.id, workspaceId: context.workspaceId, stockQuantity: product.stockQuantity },
        data: { stockQuantity: { increment: item.quantity }, costPrice: restoredCost },
      });
      if (changed.count !== 1) throw new SupplierReturnReversalError("Inventory changed while cancelling this supplier return. Retry the cancellation.");

      await tx.inventoryTransaction.create({
        data: {
          workspaceId: context.workspaceId,
          productId: item.productId,
          type: "REVERSAL",
          quantityChanged: item.quantity,
          unitCost: item.totalCost.div(item.quantity),
          reference: `REV-${supplierReturn.number}`,
        },
      });
    }

    const now = new Date();
    await tx.ledgerEntry.create({
      data: {
        workspaceId: context.workspaceId,
        supplierId: supplierReturn.supplierId,
        type: "REVERSAL",
        credit: supplierReturn.totalAmount,
        description: `Cancelled supplier return ${supplierReturn.number}: ${cleanReason}`,
        referenceId: supplierReturn.id,
        date: now,
      },
    });
    await tx.supplier.update({
      where: { id: supplierReturn.supplierId, workspaceId: context.workspaceId },
      data: { currentBalance: { increment: supplierReturn.totalAmount } },
    });
    if (supplierReturn.purchaseOrder.status !== "CANCELLED") {
      await tx.purchaseOrder.update({
        where: { id: supplierReturn.purchaseOrder.id, workspaceId: context.workspaceId },
        data: { balanceAmount: { increment: supplierReturn.totalAmount } },
      });
    }

    await reverseGeneralLedgerEntries(tx, {
      workspaceId: context.workspaceId,
      sources: [{ sourceType: "SUPPLIER_RETURN", sourceId: supplierReturn.id }],
      documentNo: `REV-${supplierReturn.number}`,
      date: now,
      reason: `Cancelled supplier return: ${cleanReason}`,
      reversedById: context.userId,
    });

    await tx.supplierReturn.update({
      where: { id: supplierReturn.id, workspaceId: context.workspaceId },
      data: { status: "CANCELLED", notes: [supplierReturn.notes, `Cancellation reason: ${cleanReason}`].filter(Boolean).join("\n") },
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "supplier_return.cancelled",
      entityType: "SupplierReturn",
      entityId: supplierReturn.id,
      metadata: { reason: cleanReason, total: supplierReturn.totalAmount.toString() },
    });

    return { id: supplierReturn.id, alreadyCancelled: false as const };
  });
}
