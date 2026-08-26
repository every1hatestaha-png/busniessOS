import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import type { ServiceContext } from "@/lib/server/sales";
import { paymentSchema, type PaymentInput } from "@/lib/validation/payment";

export class PaymentDomainError extends Error {}

export async function recordPayment(context: ServiceContext, input: PaymentInput) {
  const data = paymentSchema.parse(input);
  const amount = new Prisma.Decimal(data.amount);
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, workspaceId: context.workspaceId }, select: { id: true, currentBalance: true } });
    if (!customer) throw new PaymentDomainError("Customer not found.");
    if (amount.greaterThan(customer.currentBalance)) throw new PaymentDomainError("Payment cannot exceed customer outstanding balance.");
    let invoice: { id: string; amount: Prisma.Decimal; paidAmount: Prisma.Decimal; salesOrderId: string | null } | null = null;
    if (data.invoiceId) {
      invoice = await tx.invoice.findFirst({ where: { id: data.invoiceId, workspaceId: context.workspaceId, customerId: customer.id, status: { notIn: ["CANCELLED", "DRAFT"] } }, select: { id: true, amount: true, paidAmount: true, salesOrderId: true } });
      if (!invoice || amount.greaterThan(invoice.amount.minus(invoice.paidAmount))) throw new PaymentDomainError("Payment exceeds invoice balance or invoice is unavailable.");
    }
    const paymentNumber = await nextDocumentNumber(tx, context.workspaceId, "PAYMENT_RECEIPT");
    const payment = await tx.payment.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, invoiceId: invoice?.id, amount, method: data.method, reference: data.reference || paymentNumber, notes: data.notes || null, paymentDate: data.paymentDate }, select: { id: true } });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, type: "PAYMENT_RECEIVED", credit: amount, description: `Payment ${paymentNumber}`, referenceId: payment.id, date: data.paymentDate } });
    await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: { decrement: amount } } });
    if (invoice) {
      const paidAmount = invoice.paidAmount.plus(amount);
      await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount, status: paidAmount.equals(invoice.amount) ? "PAID" : "PARTIALLY_PAID" } });
      if (invoice.salesOrderId) await tx.salesOrder.update({ where: { id: invoice.salesOrderId }, data: { paidAmount: { increment: amount }, balanceAmount: { decrement: amount } } });
    }
    return { id: payment.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}
