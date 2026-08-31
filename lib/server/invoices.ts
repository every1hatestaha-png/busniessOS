import "server-only";

import { Prisma, type PaymentMethod } from "@prisma/client";
import { db } from "@/lib/server/db";

export async function listInvoices(workspaceId: string) {
  const rows = await db.invoice.findMany({ where: { workspaceId }, orderBy: { issuedAt: "desc" }, include: { customer: { select: { companyName: true, name: true } }, salesOrder: { select: { orderNumber: true } } } });
  return rows.map((row) => ({ id: row.id, invoiceNumber: row.invoiceNumber, customerName: row.customer.companyName ?? row.customer.name, date: row.issuedAt.toISOString(), dueDate: row.dueDate?.toISOString() ?? null, total: Number(row.amount), paid: Number(row.paidAmount), balance: Number(row.amount.minus(row.paidAmount).minus(row.creditApplied)), status: row.dueDate && row.dueDate < new Date() && ["UNPAID", "PARTIALLY_PAID"].includes(row.status) ? "OVERDUE" as const : row.status, orderNumber: row.salesOrder?.orderNumber ?? "-" }));
}

export async function getInvoice(workspaceId: string, id: string) {
  const row = await db.$queryRaw<Array<{
    id: string;
    invoiceNumber: string;
    issuedAt: Date;
    dueDate: Date | null;
    amount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    creditApplied: Prisma.Decimal;
    status: "DRAFT" | "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
    customerId: string;
    customerName: string;
    customerCompanyName: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    salesOrderId: string | null;
    orderNumber: string | null;
    subtotal: Prisma.Decimal | null;
    discount: Prisma.Decimal | null;
  }>>`
    SELECT i."id", i."invoiceNumber", i."issuedAt", i."dueDate", i."amount", i."paidAmount", i."creditApplied", i."status",
      c."id" AS "customerId", c."name" AS "customerName", c."companyName" AS "customerCompanyName", c."phone" AS "customerPhone", c."address" AS "customerAddress",
      so."id" AS "salesOrderId", so."orderNumber", so."subtotal", so."discount"
    FROM "invoices" i
    INNER JOIN "customers" c ON c."id" = i."customerId"
    LEFT JOIN "sales_orders" so ON so."id" = i."salesOrderId"
    WHERE i."id" = ${id} AND i."workspaceId" = ${workspaceId}
    LIMIT 1
  `;
  const invoice = row[0];
  if (!invoice) return null;
  const [items, directPayments, allocations] = await Promise.all([
    invoice.salesOrderId ? db.$queryRaw<Array<{ id: string; productName: string | null; fallbackProductName: string; productSku: string | null; fallbackSku: string | null; quantity: number; unitPrice: Prisma.Decimal; discount: Prisma.Decimal; totalPrice: Prisma.Decimal }>>`
      SELECT soi."id", soi."productName", p."name" AS "fallbackProductName", soi."productSku", p."sku" AS "fallbackSku", soi."quantity", soi."unitPrice", soi."discount", soi."totalPrice"
      FROM "sales_order_items" soi
      INNER JOIN "products" p ON p."id" = soi."productId"
      WHERE soi."salesOrderId" = ${invoice.salesOrderId}
      ORDER BY soi."createdAt" ASC, soi."id" ASC
    ` : Promise.resolve([]),
    db.payment.findMany({ where: { workspaceId, invoiceId: invoice.id }, orderBy: { paymentDate: "desc" }, select: { id: true, paymentDate: true, amount: true, method: true, documentNumber: true, reference: true, isReversed: true, reversalOfId: true } }),
    db.$queryRaw<Array<{ paymentId: string; paymentDate: Date; amount: Prisma.Decimal; method: PaymentMethod; documentNumber: string | null; reference: string | null; isReversed: boolean; reversalOfId: string | null }>>`
      SELECT pa."paymentId", p."paymentDate", pa."amount", p."method", p."documentNumber", p."reference", p."isReversed", p."reversalOfId"
      FROM "payment_allocations" pa
      INNER JOIN "payments" p ON p."id" = pa."paymentId"
      WHERE pa."workspaceId" = ${workspaceId} AND pa."invoiceId" = ${invoice.id}
      ORDER BY pa."createdAt" DESC
    `,
  ]);
  const status = invoice.dueDate && invoice.dueDate < new Date() && ["UNPAID", "PARTIALLY_PAID"].includes(invoice.status) ? "OVERDUE" as const : invoice.status;
  const allocatedPaymentIds = new Set(allocations.map((allocation) => allocation.paymentId));
  const payments = [
    ...allocations.map((allocation) => ({ id: allocation.paymentId, date: allocation.paymentDate.toISOString(), amount: allocation.reversalOfId ? -Number(allocation.amount) : Number(allocation.amount), method: allocation.method, reference: allocation.documentNumber ?? allocation.reference ?? "-", isReversed: allocation.isReversed, isReversal: Boolean(allocation.reversalOfId) })),
    ...directPayments.filter((payment) => !allocatedPaymentIds.has(payment.id)).map((payment) => ({ id: payment.id, date: payment.paymentDate.toISOString(), amount: payment.reversalOfId ? -Number(payment.amount) : Number(payment.amount), method: payment.method, reference: payment.documentNumber ?? payment.reference ?? "-", isReversed: payment.isReversed, isReversal: Boolean(payment.reversalOfId) })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return { id: invoice.id, invoiceNumber: invoice.invoiceNumber, date: invoice.issuedAt.toISOString(), dueDate: invoice.dueDate?.toISOString() ?? null, total: Number(invoice.amount), paid: Number(invoice.paidAmount), creditApplied: Number(invoice.creditApplied), balance: Number(invoice.amount.minus(invoice.paidAmount).minus(invoice.creditApplied)), status, customer: { id: invoice.customerId, name: invoice.customerName, companyName: invoice.customerCompanyName ?? invoice.customerName, phone: invoice.customerPhone ?? "", address: invoice.customerAddress ?? "" }, order: invoice.salesOrderId ? { id: invoice.salesOrderId, number: invoice.orderNumber ?? "-", subtotal: Number(invoice.subtotal ?? 0), discount: Number(invoice.discount ?? 0), items: items.map((item) => ({ id: item.id, name: item.productName ?? item.fallbackProductName, sku: item.productSku ?? item.fallbackSku ?? "", quantity: item.quantity, unitPrice: Number(item.unitPrice), discount: Number(item.discount), total: Number(item.totalPrice) })) } : null, payments };
}
