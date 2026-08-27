import "server-only";

import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import { saleSchema, type SaleInput } from "@/lib/validation/sale";
import { writeAudit } from "@/lib/server/audit";
import { customerReturnSchema, type CustomerReturnInput } from "@/lib/validation/returns";

export type ServiceContext = { workspaceId: string; role: Role; userId?: string };
export class SaleDomainError extends Error { constructor(public code: "CUSTOMER_NOT_FOUND" | "PRODUCT_NOT_FOUND" | "INSUFFICIENT_STOCK" | "INVALID_TOTAL" | "SALE_NOT_FOUND" | "INVALID_RETURN", message: string) { super(message); } }

export async function createSale(context: ServiceContext, input: SaleInput) {
  const data = saleSchema.parse(input);
  return db.$transaction(async (tx) => {
    const existing = await tx.salesOrder.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true } });
    if (existing) return existing;
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, workspaceId: context.workspaceId, status: "ACTIVE" }, select: { id: true } });
    if (!customer) throw new SaleDomainError("CUSTOMER_NOT_FOUND", "Customer is unavailable.");
    const products = await tx.product.findMany({ where: { workspaceId: context.workspaceId, id: { in: data.items.map((item) => item.productId) }, status: "ACTIVE" }, select: { id: true, name: true, sku: true, stockQuantity: true, costPrice: true } });
    if (products.length !== data.items.length) throw new SaleDomainError("PRODUCT_NOT_FOUND", "One or more products are unavailable.");

    const lines = data.items.map((item) => {
      const gross = new Prisma.Decimal(item.unitPrice).mul(item.quantity);
      const discount = new Prisma.Decimal(item.discount);
      return { ...item, total: gross.minus(discount) };
    });
    const subtotal = lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.unitPrice).mul(line.quantity)), new Prisma.Decimal(0));
    const lineDiscount = lines.reduce((sum, line) => sum.plus(line.discount), new Prisma.Decimal(0));
    const discount = lineDiscount.plus(data.orderDiscount);
    const total = subtotal.minus(discount);
    const paid = new Prisma.Decimal(data.paidAmount);
    if (total.isNegative() || paid.greaterThan(total)) throw new SaleDomainError("INVALID_TOTAL", "Payment or discount exceeds the order total.");

    const orderNumber = await nextDocumentNumber(tx, context.workspaceId, "SALES_ORDER");
    const invoiceNumber = await nextDocumentNumber(tx, context.workspaceId, "INVOICE");
    const order = await tx.salesOrder.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, orderNumber, status: "CONFIRMED", subtotal, discount, total, paidAmount: paid, balanceAmount: total.minus(paid), notes: data.notes || null, idempotencyKey: data.idempotencyKey }, select: { id: true } });

    for (const line of lines) {
      const product = products.find((entry) => entry.id === line.productId)!;
      const changed = await tx.product.updateMany({ where: { id: line.productId, workspaceId: context.workspaceId, stockQuantity: { gte: line.quantity } }, data: { stockQuantity: { decrement: line.quantity } } });
      if (changed.count !== 1) throw new SaleDomainError("INSUFFICIENT_STOCK", `${product.name} has insufficient stock.`);
      await tx.salesOrderItem.create({ data: { salesOrderId: order.id, productId: line.productId, productName: product.name, productSku: product.sku, quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount, totalPrice: line.total } });
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: line.productId, type: "SALE", quantityChanged: -line.quantity, unitCost: product.costPrice, reference: orderNumber } });
    }

    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 30);
    const invoice = await tx.invoice.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, salesOrderId: order.id, invoiceNumber, amount: total, paidAmount: paid, status: paid.isZero() ? "UNPAID" : paid.equals(total) ? "PAID" : "PARTIALLY_PAID", dueDate }, select: { id: true } });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, type: "SALE", debit: total, description: `Sale ${orderNumber}`, referenceId: order.id } });
    await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: { increment: total } } });
    if (paid.greaterThan(0)) {
      const paymentNumber = await nextDocumentNumber(tx, context.workspaceId, "PAYMENT_RECEIPT");
      const payment = await tx.payment.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, invoiceId: invoice.id, amount: paid, method: "CASH", reference: paymentNumber, notes: "Payment received with sale" }, select: { id: true } });
      await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, type: "PAYMENT_RECEIVED", credit: paid, description: `Payment ${paymentNumber}`, referenceId: payment.id } });
      await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: { decrement: paid } } });
    }
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "sale.created", entityType: "SalesOrder", entityId: order.id, metadata: { orderNumber, total: total.toString() } });
    return { id: order.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function createCustomerReturn(context: ServiceContext, input: CustomerReturnInput) {
  const data = customerReturnSchema.parse(input);
  return db.$transaction(async (tx) => {
    if (data.idempotencyKey) {
      const existing = await tx.customerReturn.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true } });
      if (existing) return existing;
    }
    const order = await tx.salesOrder.findFirst({ where: { id: data.salesOrderId, workspaceId: context.workspaceId, status: { not: "CANCELLED" } }, include: { items: true } });
    if (!order) throw new SaleDomainError("SALE_NOT_FOUND", "Sale not found.");
    const itemIds = data.items.map((item) => item.itemId);
    if (new Set(itemIds).size !== itemIds.length) throw new SaleDomainError("INVALID_RETURN", "Duplicate return items are not allowed.");
    const previous = await tx.customerReturnItem.groupBy({ by: ["salesOrderItemId"], where: { salesOrderItemId: { in: itemIds }, customerReturn: { workspaceId: context.workspaceId } }, _sum: { quantity: true } });
    const lines = data.items.map((item) => {
      const source = order.items.find((entry) => entry.id === item.itemId);
      const returned = previous.find((entry) => entry.salesOrderItemId === item.itemId)?._sum.quantity ?? 0;
      if (!source || item.quantity > source.quantity - returned) throw new SaleDomainError("INVALID_RETURN", "Return quantity exceeds sold quantity.");
      const unitPrice = source.totalPrice.div(source.quantity);
      return { source, quantity: item.quantity, unitPrice, total: unitPrice.mul(item.quantity) };
    });
    const total = lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0));
    const number = await nextDocumentNumber(tx, context.workspaceId, "CUSTOMER_RETURN");
    const noteNumber = await nextDocumentNumber(tx, context.workspaceId, "CREDIT_NOTE");
    const customerReturn = await tx.customerReturn.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, salesOrderId: order.id, idempotencyKey: data.idempotencyKey, number, reason: data.reason || null, totalAmount: total, restock: data.restock, notes: data.notes || null }, select: { id: true } });
    for (const line of lines) {
      await tx.customerReturnItem.create({ data: { customerReturnId: customerReturn.id, salesOrderItemId: line.source.id, productId: line.source.productId, quantity: line.quantity, unitPrice: line.unitPrice, totalPrice: line.total } });
      if (data.restock) {
        await tx.product.updateMany({ where: { id: line.source.productId, workspaceId: context.workspaceId }, data: { stockQuantity: { increment: line.quantity } } });
        await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: line.source.productId, type: "RETURN_IN", quantityChanged: line.quantity, reference: number } });
      }
    }
    await tx.creditNote.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, salesOrderId: order.id, number: noteNumber, reason: data.reason || "Customer return", amount: total, reference: number, notes: data.notes || null } });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, type: "SALES_RETURN", credit: total, description: `Customer return ${number}`, referenceId: customerReturn.id } });
    await tx.customer.update({ where: { id: order.customerId }, data: { currentBalance: { decrement: total } } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "customer_return.created", entityType: "CustomerReturn", entityId: customerReturn.id, metadata: { salesOrderId: order.id, total: total.toString() } });
    return customerReturn;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function cancelSale(context: ServiceContext, id: string, reverseInitialPayment: boolean) {
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({ where: { id, workspaceId: context.workspaceId }, include: { items: true, invoices: { include: { payments: { where: { isReversed: false }, orderBy: { createdAt: "asc" } } } } } });
    if (!order) throw new SaleDomainError("CUSTOMER_NOT_FOUND", "Sale not found.");
    if (order.status === "CANCELLED") return { id: order.id };
    const invoice = order.invoices[0];
    const activePayments = invoice?.payments ?? [];
    const initial = activePayments.find((payment) => payment.notes === "Payment received with sale");
    const laterPayments = activePayments.filter((payment) => payment.id !== initial?.id);
    if (laterPayments.length) throw new SaleDomainError("INVALID_TOTAL", "Sale cannot be cancelled after later payments have been recorded.");
    if (initial && !reverseInitialPayment) throw new SaleDomainError("INVALID_TOTAL", "Explicitly confirm reversal of the initial sale payment.");

    for (const item of order.items) {
      await tx.product.updateMany({ where: { id: item.productId, workspaceId: context.workspaceId }, data: { stockQuantity: { increment: item.quantity } } });
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: item.productId, type: "SALE_CANCELLATION", quantityChanged: item.quantity, reference: order.orderNumber } });
    }
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, type: "REVERSAL", credit: order.total, description: `Cancelled sale ${order.orderNumber}`, referenceId: order.id } });
    await tx.customer.update({ where: { id: order.customerId }, data: { currentBalance: { decrement: order.total } } });
    if (initial) {
      const reversal = await tx.payment.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, invoiceId: invoice?.id, amount: initial.amount, method: initial.method, reference: `REV-${initial.reference ?? initial.id}`, notes: "Initial sale payment reversal", reversalOfId: initial.id } });
      await tx.payment.update({ where: { id: initial.id }, data: { isReversed: true, reversedAt: new Date() } });
      await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, type: "REVERSAL", debit: initial.amount, description: `Reversed payment ${initial.reference ?? initial.id}`, referenceId: reversal.id } });
      await tx.customer.update({ where: { id: order.customerId }, data: { currentBalance: { increment: initial.amount } } });
    }
    if (invoice) await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED", paidAmount: 0 } });
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", paidAmount: 0, balanceAmount: 0, cancelledAt: new Date(), cancelledById: context.userId } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "sale.cancelled", entityType: "SalesOrder", entityId: order.id, metadata: { initialPaymentReversed: Boolean(initial) } });
    return { id: order.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function listSales(workspaceId: string) {
  const rows = await db.salesOrder.findMany({ where: { workspaceId }, orderBy: { orderDate: "desc" }, include: { customer: { select: { companyName: true, name: true } }, _count: { select: { items: true } } } });
  return rows.map((row) => ({ id: row.id, orderNumber: row.orderNumber, customerName: row.customer.companyName ?? row.customer.name, date: row.orderDate.toISOString(), items: row._count.items, total: Number(row.total), paidAmount: Number(row.paidAmount), balanceAmount: Number(row.balanceAmount), status: row.status }));
}

export async function getSale(workspaceId: string, id: string) {
  const row = await db.salesOrder.findFirst({ where: { id, workspaceId }, include: { customer: true, items: { include: { product: { select: { name: true, sku: true } } } }, invoices: true, } });
  if (!row) return null;
  return { id: row.id, orderNumber: row.orderNumber, date: row.orderDate.toISOString(), status: row.status, subtotal: Number(row.subtotal), discount: Number(row.discount), total: Number(row.total), paidAmount: Number(row.paidAmount), balanceAmount: Number(row.balanceAmount), notes: row.notes ?? "", customer: { id: row.customer.id, name: row.customer.name, companyName: row.customer.companyName ?? row.customer.name, phone: row.customer.phone ?? "", address: row.customer.address ?? "", currentBalance: Number(row.customer.currentBalance), creditLimit: Number(row.customer.creditLimit) }, items: row.items.map((item) => ({ id: item.id, productName: item.productName ?? item.product.name, sku: item.productSku ?? item.product.sku ?? "", quantity: item.quantity, unitPrice: Number(item.unitPrice), discount: Number(item.discount), total: Number(item.totalPrice) })), invoice: row.invoices[0] ? { id: row.invoices[0].id, number: row.invoices[0].invoiceNumber } : null };
}
