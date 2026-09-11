import "server-only";

import { Prisma } from "@prisma/client";
import { postCustomerPaymentToGeneralLedger, reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { canPerformAction } from "@/lib/server/authorization";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import type { ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { paymentSchema, type PaymentInput } from "@/lib/validation/payment";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";

export class PaymentDomainError extends Error {}

export async function getPaymentReceipt(workspaceId: string, id: string) {
  const payment = await db.payment.findFirst({
    where: { id, workspaceId, customerId: { not: null } },
    include: {
      customer: { select: { id: true, name: true, companyName: true, phone: true, address: true } },
      cashBankAccount: { select: { name: true, account: { select: { code: true } } } },
      invoice: { select: { id: true, invoiceNumber: true } },
      allocations: { include: { invoice: { select: { id: true, invoiceNumber: true } } }, orderBy: { createdAt: "asc" } },
      reversalOf: { select: { id: true, documentNumber: true } },
    },
  });
  if (!payment || !payment.customer) return null;
  const allocations = payment.allocations.map((allocation) => ({ id: allocation.id, invoiceId: allocation.invoiceId, invoiceNumber: allocation.invoice?.invoiceNumber ?? "Unassigned", amount: Number(allocation.amount) }));
  const allocatedAmount = payment.allocations.length
    ? payment.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0))
    : payment.invoice ? payment.amount : new Prisma.Decimal(0);
  return {
    id: payment.id,
    documentNumber: payment.documentNumber ?? `Payment ${payment.id.slice(0, 8)}`,
    amount: Number(payment.amount),
    allocatedAmount: Number(allocatedAmount),
    unallocatedAmount: Number(payment.amount.minus(allocatedAmount)),
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
    paymentDate: payment.paymentDate.toISOString(),
    isReversed: payment.isReversed,
    isReversal: Boolean(payment.reversalOfId),
    reversalOf: payment.reversalOf,
    customer: { ...payment.customer, companyName: payment.customer.companyName ?? payment.customer.name },
    cashBankAccount: payment.cashBankAccount,
    allocations: allocations.length ? allocations : payment.invoice ? [{ id: `direct-${payment.id}`, invoiceId: payment.invoice.id, invoiceNumber: payment.invoice.invoiceNumber, amount: Number(payment.amount) }] : [],
  };
}

export async function recordPayment(context: ServiceContext, input: PaymentInput) {
  const data = paymentSchema.parse(input);
  const amount = new Prisma.Decimal(data.amount);
  return withSerializableRetry(async (tx) => {
    if (data.idempotencyKey) {
      const existing = await tx.payment.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true, customerId: true, supplierId: true, amount: true, cashBankAccountId: true, method: true, invoiceId: true, allocations: { select: { invoiceId: true, amount: true } } } });
      if (existing) {
        const requested = data.allocations?.length ? data.allocations : data.invoiceId ? [{ invoiceId: data.invoiceId, amount: data.amount }] : [];
        const sameAllocations = requested.length === existing.allocations.length && requested.every((entry) => existing.allocations.some((allocation) => allocation.invoiceId === entry.invoiceId && allocation.amount.equals(entry.amount)));
        if (existing.supplierId || existing.customerId !== data.customerId || !existing.amount.equals(data.amount) || existing.cashBankAccountId !== data.cashBankAccountId || existing.method !== data.method || !sameAllocations) throw new PaymentDomainError("This idempotency key was already used for a different payment request.");
        return { id: existing.id };
      }
    }
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, workspaceId: context.workspaceId }, select: { id: true, currentBalance: true } });
    if (!customer) throw new PaymentDomainError("Customer not found.");
    if (!data.cashBankAccountId) throw new PaymentDomainError("Select a cash/bank account for this receipt.");
    const cashBankAccount = await tx.cashBankAccount.findFirst({ where: { id: data.cashBankAccountId, workspaceId: context.workspaceId, isActive: true }, select: { id: true } });
    if (!cashBankAccount) throw new PaymentDomainError("Cash/bank account is unavailable.");
    // Advance / unallocated payments are allowed: a negative currentBalance means the customer
    // holds credit on account that will be applied against future invoices.
    const requestedAllocations = data.allocations?.length ? data.allocations : data.invoiceId ? [{ invoiceId: data.invoiceId, amount: data.amount }] : [];
    let invoices: { id: string; amount: Prisma.Decimal; paidAmount: Prisma.Decimal; creditApplied: Prisma.Decimal; salesOrderId: string | null }[] = [];
    if (requestedAllocations.length) {
      const allocationTotal = requestedAllocations.reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
      if (!allocationTotal.equals(amount)) throw new PaymentDomainError("Payment allocations must equal the payment amount.");
      const invoiceIds = requestedAllocations.map((entry) => entry.invoiceId);
      if (new Set(invoiceIds).size !== invoiceIds.length) throw new PaymentDomainError("Duplicate invoice allocations are not allowed.");
      invoices = await tx.invoice.findMany({ where: { id: { in: invoiceIds }, workspaceId: context.workspaceId, customerId: customer.id, status: { notIn: ["CANCELLED", "DRAFT"] } }, select: { id: true, amount: true, paidAmount: true, creditApplied: true, salesOrderId: true } });
      if (invoices.length !== requestedAllocations.length) throw new PaymentDomainError("One or more invoices are unavailable.");
      for (const allocation of requestedAllocations) {
        const invoice = invoices.find((entry) => entry.id === allocation.invoiceId)!;
        if (new Prisma.Decimal(allocation.amount).greaterThan(invoice.amount.minus(invoice.paidAmount).minus(invoice.creditApplied))) throw new PaymentDomainError("Payment exceeds invoice balance or invoice is unavailable.");
      }
    }
    const paymentNumber = await nextDocumentNumber(tx, context.workspaceId, "PAYMENT_RECEIPT");
    const payment = await tx.payment.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, invoiceId: requestedAllocations.length === 1 ? requestedAllocations[0].invoiceId : null, cashBankAccountId: cashBankAccount.id, documentNumber: paymentNumber, idempotencyKey: data.idempotencyKey, amount, netAmount: amount, method: data.method, reference: data.reference || null, notes: data.notes || null, paymentDate: data.paymentDate }, select: { id: true } });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, type: "PAYMENT_RECEIVED", credit: amount, description: `Payment ${paymentNumber}`, referenceId: payment.id, date: data.paymentDate } });
    await tx.customer.update({ where: { id: customer.id, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: amount } } });
    await postCustomerPaymentToGeneralLedger(tx, { workspaceId: context.workspaceId, paymentId: payment.id, documentNo: paymentNumber, date: data.paymentDate, amount, cashBankAccountId: cashBankAccount.id });
    for (const allocation of requestedAllocations) {
      const invoice = invoices.find((entry) => entry.id === allocation.invoiceId)!;
      const allocationAmount = new Prisma.Decimal(allocation.amount);
      await tx.paymentAllocation.create({ data: { workspaceId: context.workspaceId, paymentId: payment.id, invoiceId: invoice.id, amount: allocationAmount } });
      const paidAmount = invoice.paidAmount.plus(allocationAmount);
      const settledAmount = paidAmount.plus(invoice.creditApplied);
      await tx.invoice.update({ where: { id: invoice.id, workspaceId: context.workspaceId }, data: { paidAmount, status: settledAmount.equals(invoice.amount) ? "PAID" : "PARTIALLY_PAID" } });
      if (invoice.salesOrderId) await tx.salesOrder.update({ where: { id: invoice.salesOrderId, workspaceId: context.workspaceId }, data: { paidAmount: { increment: allocationAmount }, balanceAmount: { decrement: allocationAmount } } });
    }
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "customer.payment_recorded", entityType: "Payment", entityId: payment.id, metadata: { amount: data.amount } });
    return { id: payment.id };
  });
}

/**
 * Reverse a standalone customer receipt without deleting financial history.
 * Payments captured as part of sale creation are intentionally excluded because
 * their cash/AR GL entries use the sale as the accounting source; those must be
 * reversed through cancelSale so stock, revenue, invoice and payment stay atomic.
 */
export async function reverseCustomerPayment(context: ServiceContext, paymentId: string, reason: string) {
  if (!canPerformAction(context.role, "financial.manage")) throw new PaymentDomainError("Unauthorized");
  const cleanReason = reason.trim();
  if (cleanReason.length < 3 || cleanReason.length > 500) throw new PaymentDomainError("Provide a reversal reason between 3 and 500 characters.");

  return withSerializableRetry(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, workspaceId: context.workspaceId, customerId: { not: null } },
      include: {
        allocations: {
          include: {
            invoice: { select: { id: true, amount: true, paidAmount: true, creditApplied: true, salesOrderId: true, status: true } },
          },
        },
        reversals: { select: { id: true }, take: 1 },
      },
    });
    if (!payment || !payment.customerId) throw new PaymentDomainError("Customer payment not found.");
    if (payment.reversalOfId) throw new PaymentDomainError("A reversal entry cannot be reversed again.");
    if (payment.isReversed) {
      const existingReversal = payment.reversals[0];
      if (existingReversal) return { id: existingReversal.id, alreadyReversed: true as const };
      throw new PaymentDomainError("This payment is already marked reversed.");
    }
    if (!payment.cashBankAccountId) throw new PaymentDomainError("Payment has no cash/bank account and cannot be safely reversed.");

    // Standalone receipts post GL entries with sourceId = payment.id. Payments
    // captured during createSale are posted under the sale id and must use sale cancellation.
    const standalonePostingCount = await tx.generalLedgerEntry.count({
      where: { workspaceId: context.workspaceId, sourceType: "RECEIPT", sourceId: payment.id, reversalOfId: null },
    });
    if (standalonePostingCount === 0) throw new PaymentDomainError("This receipt was recorded with a sale. Cancel the sale to reverse it safely.");

    const now = new Date();
    const reversalNumber = await nextDocumentNumber(tx, context.workspaceId, "PAYMENT_RECEIPT");
    const reversal = await tx.payment.create({
      data: {
        workspaceId: context.workspaceId,
        customerId: payment.customerId,
        invoiceId: payment.invoiceId,
        cashBankAccountId: payment.cashBankAccountId,
        documentNumber: reversalNumber,
        amount: payment.amount,
        netAmount: payment.amount,
        method: payment.method,
        reference: `REV-${payment.documentNumber ?? payment.reference ?? payment.id.slice(0, 8)}`,
        notes: `Payment reversal: ${cleanReason}`,
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
        customerId: payment.customerId,
        type: "REVERSAL",
        debit: payment.amount,
        description: `Reversed payment ${payment.documentNumber ?? payment.id}: ${cleanReason}`,
        referenceId: reversal.id,
        date: now,
      },
    });
    await tx.customer.update({
      where: { id: payment.customerId, workspaceId: context.workspaceId },
      data: { currentBalance: { increment: payment.amount } },
    });
    await tx.cashBankAccount.update({
      where: { id: payment.cashBankAccountId, workspaceId: context.workspaceId },
      data: { currentBalance: { decrement: payment.amount } },
    });

    for (const allocation of payment.allocations) {
      if (!allocation.invoiceId || !allocation.invoice) continue;
      const allocationAmount = new Prisma.Decimal(allocation.amount);
      const nextPaid = allocation.invoice.paidAmount.minus(allocationAmount);
      if (nextPaid.isNegative()) throw new PaymentDomainError("Payment reversal would make an invoice paid amount negative.");
      const settled = nextPaid.plus(allocation.invoice.creditApplied);
      const nextStatus = settled.greaterThanOrEqualTo(allocation.invoice.amount)
        ? "PAID"
        : settled.greaterThan(0)
          ? "PARTIALLY_PAID"
          : "UNPAID";
      if (allocation.invoice.status !== "CANCELLED") {
        await tx.invoice.update({
          where: { id: allocation.invoice.id, workspaceId: context.workspaceId },
          data: { paidAmount: nextPaid, status: nextStatus },
        });
      }
      if (allocation.invoice.salesOrderId) {
        await tx.salesOrder.updateMany({
          where: { id: allocation.invoice.salesOrderId, workspaceId: context.workspaceId, status: { not: "CANCELLED" } },
          data: { paidAmount: { decrement: allocationAmount }, balanceAmount: { increment: allocationAmount } },
        });
      }
    }

    await reverseGeneralLedgerEntries(tx, {
      workspaceId: context.workspaceId,
      sources: [{ sourceType: "RECEIPT", sourceId: payment.id }],
      documentNo: `REV-${payment.documentNumber ?? reversalNumber}`,
      date: now,
      reason: `Reversed customer payment: ${cleanReason}`,
      reversedById: context.userId,
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "customer.payment_reversed",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { reversalId: reversal.id, reversalNumber, reason: cleanReason, amount: payment.amount.toString() },
    });

    return { id: reversal.id, alreadyReversed: false as const };
  });
}
