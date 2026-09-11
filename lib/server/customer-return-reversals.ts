import "server-only";

import { Prisma } from "@prisma/client";

import { reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { canPerformAction } from "@/lib/server/authorization";
import { writeAudit } from "@/lib/server/audit";
import type { ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";

export class CustomerReturnReversalError extends Error {}

export async function cancelCustomerReturn(context: ServiceContext, customerReturnId: string, reason: string) {
  if (!canPerformAction(context.role, "financial.manage")) throw new CustomerReturnReversalError("Unauthorized");
  const cleanReason = reason.trim();
  if (cleanReason.length < 3 || cleanReason.length > 500) throw new CustomerReturnReversalError("Provide a cancellation reason between 3 and 500 characters.");

  return withSerializableRetry(async (tx) => {
    const customerReturn = await tx.customerReturn.findFirst({
      where: { id: customerReturnId, workspaceId: context.workspaceId },
      include: {
        items: { select: { id: true, productId: true, quantity: true } },
        creditNote: { include: { allocations: { select: { id: true }, take: 1 } } },
      },
    });
    if (!customerReturn) throw new CustomerReturnReversalError("Customer return not found.");
    const creditNote = customerReturn.creditNote;
    if (!creditNote) throw new CustomerReturnReversalError("Customer return has no linked credit note and cannot be safely cancelled.");
    if (creditNote.status === "CANCELLED") return { id: customerReturn.id, alreadyCancelled: true as const };
    if (creditNote.allocations.length > 0 || creditNote.appliedAmount.gt(0) || creditNote.status !== "OPEN") {
      throw new CustomerReturnReversalError("This return credit has already been applied. Reverse the credit allocation before cancelling the customer return.");
    }

    if (customerReturn.restock) {
      for (const item of customerReturn.items) {
        if (item.quantity.lte(0)) throw new CustomerReturnReversalError("Customer return contains an invalid non-positive quantity.");
        const [product, returnMovement] = await Promise.all([
          tx.product.findFirst({ where: { id: item.productId, workspaceId: context.workspaceId }, select: { id: true, stockQuantity: true, costPrice: true } }),
          tx.inventoryTransaction.findFirst({
            where: { workspaceId: context.workspaceId, productId: item.productId, type: "RETURN_IN", reference: customerReturn.number },
            orderBy: { createdAt: "asc" },
            select: { unitCost: true },
          }),
        ]);
        if (!product || !returnMovement?.unitCost) throw new CustomerReturnReversalError("Historical return inventory cost is unavailable; automatic cancellation is unsafe.");
        if (product.stockQuantity.lt(item.quantity)) throw new CustomerReturnReversalError("Returned stock has already been consumed. Restore sufficient stock before cancelling this return.");

        const historicalValue = returnMovement.unitCost.mul(item.quantity);
        const resultingQuantity = product.stockQuantity.minus(item.quantity);
        const resultingValue = product.costPrice.mul(product.stockQuantity).minus(historicalValue);
        if (resultingValue.lt(0)) throw new CustomerReturnReversalError("Cancelling this return would create a negative inventory value. Review subsequent stock movements first.");
        const resultingCost = resultingQuantity.gt(0) ? resultingValue.div(resultingQuantity) : new Prisma.Decimal(0);

        const changed = await tx.product.updateMany({
          where: { id: product.id, workspaceId: context.workspaceId, stockQuantity: product.stockQuantity },
          data: { stockQuantity: { decrement: item.quantity }, costPrice: resultingCost },
        });
        if (changed.count !== 1) throw new CustomerReturnReversalError("Inventory changed while cancelling this customer return. Retry the cancellation.");
        await tx.inventoryTransaction.create({
          data: {
            workspaceId: context.workspaceId,
            productId: product.id,
            type: "ADJUSTMENT",
            quantityChanged: item.quantity.negated(),
            unitCost: returnMovement.unitCost,
            reference: `REV-${customerReturn.number}`,
          },
        });
      }
    }

    const now = new Date();
    await tx.ledgerEntry.create({
      data: {
        workspaceId: context.workspaceId,
        customerId: customerReturn.customerId,
        type: "REVERSAL",
        debit: customerReturn.totalAmount,
        description: `Cancelled customer return ${customerReturn.number}: ${cleanReason}`,
        referenceId: customerReturn.id,
        date: now,
      },
    });
    await tx.customer.update({
      where: { id: customerReturn.customerId, workspaceId: context.workspaceId },
      data: { currentBalance: { increment: customerReturn.totalAmount } },
    });
    await tx.creditNote.update({
      where: { id: creditNote.id, workspaceId: context.workspaceId },
      data: { status: "CANCELLED", notes: [creditNote.notes, `Cancelled with customer return: ${cleanReason}`].filter(Boolean).join("\n") },
    });
    await tx.customerReturn.update({
      where: { id: customerReturn.id, workspaceId: context.workspaceId },
      data: { notes: [customerReturn.notes, `Cancellation reason: ${cleanReason}`].filter(Boolean).join("\n") },
    });

    await reverseGeneralLedgerEntries(tx, {
      workspaceId: context.workspaceId,
      sources: [{ sourceType: "CUSTOMER_RETURN", sourceId: customerReturn.id }],
      documentNo: `REV-${customerReturn.number}`,
      date: now,
      reason: `Cancelled customer return: ${cleanReason}`,
      reversedById: context.userId,
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "customer_return.cancelled",
      entityType: "CustomerReturn",
      entityId: customerReturn.id,
      metadata: { reason: cleanReason, creditNoteId: creditNote.id, total: customerReturn.totalAmount.toString(), restock: customerReturn.restock },
    });

    return { id: customerReturn.id, alreadyCancelled: false as const };
  });
}
