import "server-only";

import { Prisma } from "@prisma/client";
import { postCustomerPaymentToGeneralLedger } from "@/lib/server/accounting";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import type { ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { paymentSchema, type PaymentInput } from "@/lib/validation/payment";
import { writeAudit } from "@/lib/server/audit";

export class PaymentDomainError extends Error {}

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
    if (amount.greaterThan(customer.currentBalance)) throw new PaymentDomainError("Payment cannot exceed customer outstanding balance.");
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
