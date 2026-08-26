import "server-only";

import { db } from "@/lib/server/db";

export async function listInvoices(workspaceId: string) {
  const rows = await db.invoice.findMany({ where: { workspaceId }, orderBy: { issuedAt: "desc" }, include: { customer: { select: { companyName: true, name: true } }, salesOrder: { select: { orderNumber: true } } } });
  return rows.map((row) => ({ id: row.id, invoiceNumber: row.invoiceNumber, customerName: row.customer.companyName ?? row.customer.name, date: row.issuedAt.toISOString(), dueDate: row.dueDate?.toISOString() ?? null, total: Number(row.amount), paid: Number(row.paidAmount), balance: Number(row.amount.minus(row.paidAmount)), status: row.dueDate && row.dueDate < new Date() && ["UNPAID", "PARTIALLY_PAID"].includes(row.status) ? "OVERDUE" as const : row.status, orderNumber: row.salesOrder?.orderNumber ?? "-" }));
}

export async function getInvoice(workspaceId: string, id: string) {
  const row = await db.invoice.findFirst({ where: { id, workspaceId }, include: { customer: true, salesOrder: { include: { items: { include: { product: { select: { name: true, sku: true } } } } } }, payments: { orderBy: { paymentDate: "desc" } } } });
  if (!row) return null;
  const status = row.dueDate && row.dueDate < new Date() && ["UNPAID", "PARTIALLY_PAID"].includes(row.status) ? "OVERDUE" as const : row.status;
  return { id: row.id, invoiceNumber: row.invoiceNumber, date: row.issuedAt.toISOString(), dueDate: row.dueDate?.toISOString() ?? null, total: Number(row.amount), paid: Number(row.paidAmount), balance: Number(row.amount.minus(row.paidAmount)), status, customer: { id: row.customer.id, name: row.customer.name, companyName: row.customer.companyName ?? row.customer.name, phone: row.customer.phone ?? "", address: row.customer.address ?? "" }, order: row.salesOrder ? { id: row.salesOrder.id, number: row.salesOrder.orderNumber, subtotal: Number(row.salesOrder.subtotal), discount: Number(row.salesOrder.discount), items: row.salesOrder.items.map((item) => ({ id: item.id, name: item.product.name, sku: item.product.sku ?? "", quantity: item.quantity, unitPrice: Number(item.unitPrice), discount: Number(item.discount), total: Number(item.totalPrice) })) } : null, payments: row.payments.map((payment) => ({ id: payment.id, date: payment.paymentDate.toISOString(), amount: Number(payment.amount), method: payment.method, reference: payment.reference ?? "-" })) };
}
