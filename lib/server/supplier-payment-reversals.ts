import "server-only";

import { Prisma } from "@prisma/client";

import { reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { canPerformAction } from "@/lib/server/authorization";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import type { ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";

export class SupplierPaymentReversalError extends Error {}

export async function getSupplierPaymentReversalState(workspaceId: string, paymentId: string) {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, workspaceId, supplierId: { not: null } },
    select: { id: true, isReversed: true, reversalOfId: true },
  });
  if (!payment) return null;
  return { canReverse: !payment.isReversed && !payment.reversalOfId, isReversed: payment.isReversed, isReversal: Boolean(payment.reversalOfId) };
}

export async function reverseSupplierPayment(context: ServiceContext, paymentId: string, reason: string) {
  if (!canPerformAction(context.role, "financial.manage")) throw new SupplierPaymentReversalError("Unauthorized");
  const cleanReason = reason.trim();
  if (cleanReason.length < 3 || cleanReason.length > 500) throw new SupplierPaymentReversalError("Provide a reversal reason between 3 and 500 characters.");

  return withSerializableRetry(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, workspaceId: context.workspaceId, supplierId: { not: null } },
      include: {
        allocations: { include: { purchaseOrder: { select: { id: true, paidAmount: true, balanceAmount: true, status: true } } } },
        reversals: { select: { id: true }, take: 1 },
      },
    });
    if (!payment || !payment.supplierId) throw new SupplierPaymentReversalError("Supplier payment not found.");
    if (payment.reversalOfId) throw new SupplierPaymentReversalError("A reversal entry cannot be reversed again.");
    if (payment.isReversed) {
      const existingReversal = payment.reversals[0];
      if (existingReversal) return { id: existingReversal.id, alreadyReversed: true as const };
      throw new SupplierPaymentReversalError("This payment is already marked reversed.");
    }
    if (!payment.cashBankAccountId) throw new SupplierPaymentReversalError("Payment has no cash/bank account and cannot be safely reversed.");

    const now = new Date();
    const gross = new Prisma.Decimal(payment.amount);
    const withholding = new Prisma.Decimal(payment.withholdingTaxAmount);
    const net = payment.netAmount ? new Prisma.Decimal(payment.netAmount) : gross.minus(withholding);
    if (net.isNegative()) throw new SupplierPaymentReversalError("Stored supplier payment has an invalid negative net amount.");

    const reversalNumber = await nextDocumentNumber(tx, context.workspaceId, "BANK_PAYMENT_VOUCHER");
    const reversal = await tx.payment.create({
      data: {
        workspaceId: context.workspaceId,
        supplierId: payment.supplierId,
        cashBankAccountId: payment.cashBankAccountId,
        documentNumber: reversalNumber,
        amount: gross,
        netAmount: net,
        withholdingTaxAmount: withholding,
        method: payment.method,
        reference: `REV-${payment.documentNumber ?? payment.reference ?? payment.id.slice(0, 8)}`,
        notes: `Supplier payment reversal: ${cleanReason}`,
        paymentDate: now,
        reversalOfId: payment.id,
      },
      select: { id: true },
    });

    await tx.payment.update({
      where: { id: payment.id, workspaceId: context.workspaceId },
      data: { isReversed: true, reversedAt: now },
    });

    await tx.ledgerEntry.create({
      data: {
        workspaceId: context.workspaceId,
        supplierId: payment.supplierId,
        type: "REVERSAL",
        credit: gross,
        description: `Reversed supplier payment ${payment.documentNumber ?? payment.id}: ${cleanReason}`,
        referenceId: reversal.id,
        date: now,
      },
    });
    await tx.supplier.update({
      where: { id: payment.supplierId, workspaceId: context.workspaceId },
      data: { currentBalance: { increment: gross } },
    });
    await tx.cashBankAccount.update({
      where: { id: payment.cashBankAccountId, workspaceId: context.workspaceId },
      data: { currentBalance: { increment: net } },
    });

    for (const allocation of payment.allocations) {
      if (!allocation.purchaseOrderId || !allocation.purchaseOrder) continue;
      const allocationAmount = new Prisma.Decimal(allocation.amount);
      if (allocation.purchaseOrder.paidAmount.lessThan(allocationAmount)) throw new SupplierPaymentReversalError("Payment reversal would make a purchase paid amount negative.");
      if (allocation.purchaseOrder.status !== "CANCELLED") {
        await tx.purchaseOrder.update({
          where: { id: allocation.purchaseOrder.id, workspaceId: context.workspaceId },
          data: { paidAmount: { decrement: allocationAmount }, balanceAmount: { increment: allocationAmount } },
        });
      }
    }

    await reverseGeneralLedgerEntries(tx, {
      workspaceId: context.workspaceId,
      sources: [{ sourceType: "PAYMENT", sourceId: payment.id }],
      documentNo: `REV-${payment.documentNumber ?? reversalNumber}`,
      date: now,
      reason: `Reversed supplier payment: ${cleanReason}`,
      reversedById: context.userId,
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "supplier.payment_reversed",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { reversalId: reversal.id, reversalNumber, reason: cleanReason, grossAmount: gross.toString(), withholdingTaxAmount: withholding.toString(), netAmount: net.toString() },
    });

    return { id: reversal.id, alreadyReversed: false as const };
  });
}
