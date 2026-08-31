import "server-only";

import { db } from "@/lib/server/db";

export async function listInvoices(workspaceId: string) {
  const rows = await db.invoice.findMany({ where: { workspaceId }, orderBy: { issuedAt: "desc" }, include: { customer: { select: { companyName: true, name: true } }, salesOrder: { select: { orderNumber: true } } } });
  return rows.map((row) => ({ id: row.id, invoiceNumber: row.invoiceNumber, customerName: row.customer.companyName ?? row.customer.name, date: row.issuedAt.toISOString(), dueDate: row.dueDate?.toISOString() ?? null, total: Number(row.amount), paid: Number(row.paidAmount), balance: Number(row.amount.minus(row.paidAmount).minus(row.creditApplied)), status: row.dueDate && row.dueDate < new Date() && ["UNPAID", "PARTIALLY_PAID"].includes(row.status) ? "OVERDUE" as const : row.status, orderNumber: row.salesOrder?.orderNumber ?? "-" }));
}

export async function getInvoice(workspaceId: string, id: string) {
  const row = await db.invoice.findFirst({ where: { id, workspaceId }, include: { customer: true, salesOrder: { include: { items: { include: { product: { select: { name: true, sku: true } } } } } }, payments: { orderBy: { paymentDate: "desc" } }, allocations: { include: { payment: true }, orderBy: { createdAt: "desc" } } } });
  if (!row) return null;
  const status = row.dueDate && row.dueDate < new Date() && ["UNPAID", "PARTIALLY_PAID"].includes(row.status) ? "OVERDUE" as const : row.status;
  const allocatedPaymentIds = new Set(row.allocations.map((allocation) => allocation.paymentId));
  const payments = [
    ...row.allocations.map((allocation) => ({ id: allocation.payment.id, date: allocation.payment.paymentDate.toISOString(), amount: allocation.payment.reversalOfId ? -Number(allocation.amount) : Number(allocation.amount), method: allocation.payment.method, reference: allocation.payment.documentNumber ?? allocation.payment.reference ?? "-", isReversed: allocation.payment.isReversed, isReversal: Boolean(allocation.payment.reversalOfId) })),
    ...row.payments.filter((payment) => !allocatedPaymentIds.has(payment.id)).map((payment) => ({ id: payment.id, date: payment.paymentDate.toISOString(), amount: payment.reversalOfId ? -Number(payment.amount) : Number(payment.amount), method: payment.method, reference: payment.documentNumber ?? payment.reference ?? "-", isReversed: payment.isReversed, isReversal: Boolean(payment.reversalOfId) })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return { id: row.id, invoiceNumber: row.invoiceNumber, date: row.issuedAt.toISOString(), dueDate: row.dueDate?.toISOString() ?? null, total: Number(row.amount), paid: Number(row.paidAmount), creditApplied: Number(row.creditApplied), balance: Number(row.amount.minus(row.paidAmount).minus(row.creditApplied)), status, customer: { id: row.customer.id, name: row.customer.name, companyName: row.customer.companyName ?? row.customer.name, phone: row.customer.phone ?? "", address: row.customer.address ?? "" }, order: row.salesOrder ? { id: row.salesOrder.id, number: row.salesOrder.orderNumber, subtotal: Number(row.salesOrder.subtotal), discount: Number(row.salesOrder.discount), items: row.salesOrder.items.map((item) => ({ id: item.id, name: item.productName ?? item.product.name, sku: item.productSku ?? item.product.sku ?? "", quantity: item.quantity, unitPrice: Number(item.unitPrice), discount: Number(item.discount), total: Number(item.totalPrice) })) } : null, payments };
}
