import "server-only";

import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import { postCustomerReturnToGeneralLedger, postSaleToGeneralLedger, reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { saleSchema, type SaleInput } from "@/lib/validation/sale";
import { writeAudit } from "@/lib/server/audit";
import { customerReturnSchema, type CustomerReturnInput } from "@/lib/validation/returns";
import { canPerformAction } from "@/lib/server/authorization";

export type ServiceContext = { workspaceId: string; role: Role; userId?: string };
export class SaleDomainError extends Error { constructor(public code: "CUSTOMER_NOT_FOUND" | "PRODUCT_NOT_FOUND" | "INSUFFICIENT_STOCK" | "INVALID_TOTAL" | "SALE_NOT_FOUND" | "INVALID_RETURN", message: string) { super(message); } }

export async function createSale(context: ServiceContext, input: SaleInput) {
  const data = saleSchema.parse(input);
  return withSerializableRetry(async (tx) => {
    const existing = await tx.salesOrder.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true } });
    if (existing) return existing;
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, workspaceId: context.workspaceId, status: "ACTIVE" }, select: { id: true, currentBalance: true, creditLimit: true } });
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
    if (paid.greaterThan(0) && !canPerformAction(context.role, "payments.record")) throw new SaleDomainError("INVALID_TOTAL", "You do not have permission to record a payment with this sale.");
    const additionalCredit = total.minus(paid);
    if (customer.creditLimit.greaterThan(0) && customer.currentBalance.plus(additionalCredit).greaterThan(customer.creditLimit)) throw new SaleDomainError("INVALID_TOTAL", "This sale exceeds the customer's credit limit.");

    const orderNumber = await nextDocumentNumber(tx, context.workspaceId, "SALES_ORDER");
    const invoiceNumber = await nextDocumentNumber(tx, context.workspaceId, "INVOICE");
    const order = await tx.salesOrder.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, orderNumber, status: "CONFIRMED", subtotal, discount, total, paidAmount: paid, balanceAmount: total.minus(paid), notes: data.notes || null, idempotencyKey: data.idempotencyKey }, select: { id: true, orderDate: true } });
    const cashBankAccountId = data.cashBankAccountId && data.cashBankAccountId !== "" ? data.cashBankAccountId : null;
    let receiptMethod: "CASH" | "BANK_TRANSFER" = "CASH";
    if (paid.greaterThan(0) && cashBankAccountId) {
      const cashBankAccount = await tx.cashBankAccount.findFirst({ where: { id: cashBankAccountId, workspaceId: context.workspaceId, isActive: true }, select: { id: true, isBank: true } });
      if (!cashBankAccount) throw new SaleDomainError("INVALID_TOTAL", "Cash/bank account is unavailable.");
      receiptMethod = cashBankAccount.isBank ? "BANK_TRANSFER" : "CASH";
    }
    let costOfGoodsSold = new Prisma.Decimal(0);

    for (const line of lines) {
      const product = products.find((entry) => entry.id === line.productId)!;
      costOfGoodsSold = costOfGoodsSold.plus(product.costPrice.mul(line.quantity));
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
      const payment = await tx.payment.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, invoiceId: invoice.id, cashBankAccountId, amount: paid, method: receiptMethod, reference: paymentNumber, notes: "Payment received with sale" }, select: { id: true } });
      await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, type: "PAYMENT_RECEIVED", credit: paid, description: `Payment ${paymentNumber}`, referenceId: payment.id } });
      await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: { decrement: paid } } });
    }
    await postSaleToGeneralLedger(tx, { workspaceId: context.workspaceId, saleId: order.id, orderNumber, date: order.orderDate, revenue: total, costOfGoodsSold, cashReceived: paid, cashBankAccountId });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "sale.created", entityType: "SalesOrder", entityId: order.id, metadata: { orderNumber, total: total.toString() } });
    return { id: order.id };
  });
}

export async function createCustomerReturn(context: ServiceContext, input: CustomerReturnInput) {
  const data = customerReturnSchema.parse(input);
  return withSerializableRetry(async (tx) => {
    if (data.idempotencyKey) {
      const existing = await tx.customerReturn.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true } });
      if (existing) return existing;
    }
    const order = await tx.salesOrder.findFirst({ where: { id: data.salesOrderId, workspaceId: context.workspaceId, status: { not: "CANCELLED" } }, include: { items: true } });
    if (!order) throw new SaleDomainError("SALE_NOT_FOUND", "Sale not found.");
    const itemIds = data.items.map((item) => item.itemId);
    if (new Set(itemIds).size !== itemIds.length) throw new SaleDomainError("INVALID_RETURN", "Duplicate return items are not allowed.");
    const previous = await tx.customerReturnItem.groupBy({ by: ["salesOrderItemId"], where: { salesOrderItemId: { in: itemIds }, customerReturn: { workspaceId: context.workspaceId } }, _sum: { quantity: true } });
    const refundableBase = order.items.reduce((sum, entry) => sum.plus(entry.totalPrice), new Prisma.Decimal(0));
    const lines = data.items.map((item) => {
      const source = order.items.find((entry) => entry.id === item.itemId);
      const returned = Number(previous.find((entry) => entry.salesOrderItemId === item.itemId)?._sum.quantity ?? 0);
      if (!source || item.quantity > source.quantity.toNumber() - returned) throw new SaleDomainError("INVALID_RETURN", "Return quantity exceeds sold quantity.");
      const allocatedLineTotal = refundableBase.isZero() ? new Prisma.Decimal(0) : source.totalPrice.mul(order.total).div(refundableBase);
      const unitPrice = allocatedLineTotal.div(source.quantity);
      return { source, quantity: item.quantity, unitPrice, total: unitPrice.mul(item.quantity) };
    });
    const total = lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0));
    const saleCosts = data.restock ? await tx.inventoryTransaction.findMany({ where: { workspaceId: context.workspaceId, reference: order.orderNumber, type: "SALE", productId: { in: lines.map((line) => line.source.productId) } }, select: { productId: true, unitCost: true } }) : [];
    const inventoryCost = lines.reduce((sum, line) => {
      const cost = saleCosts.find((entry) => entry.productId === line.source.productId)?.unitCost ?? new Prisma.Decimal(0);
      return sum.plus(cost.mul(line.quantity));
    }, new Prisma.Decimal(0));
    const number = await nextDocumentNumber(tx, context.workspaceId, "CUSTOMER_RETURN");
    const noteNumber = await nextDocumentNumber(tx, context.workspaceId, "CREDIT_NOTE");
    const customerReturn = await tx.customerReturn.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, salesOrderId: order.id, idempotencyKey: data.idempotencyKey, number, reason: data.reason || null, totalAmount: total, restock: data.restock, notes: data.notes || null }, select: { id: true, date: true } });
    for (const line of lines) {
      await tx.customerReturnItem.create({ data: { customerReturnId: customerReturn.id, salesOrderItemId: line.source.id, productId: line.source.productId, quantity: line.quantity, unitPrice: line.unitPrice, totalPrice: line.total } });
      if (data.restock) {
        const historicalCost = saleCosts.find((entry) => entry.productId === line.source.productId)?.unitCost ?? new Prisma.Decimal(0);
        const product = await tx.product.findFirstOrThrow({ where: { id: line.source.productId, workspaceId: context.workspaceId }, select: { stockQuantity: true, costPrice: true } });
        const currentStock = product.stockQuantity.toNumber();
        const resultingQuantity = currentStock + line.quantity;
        const resultingCost = product.costPrice.mul(currentStock).plus(historicalCost.mul(line.quantity)).div(resultingQuantity);
        await tx.product.updateMany({ where: { id: line.source.productId, workspaceId: context.workspaceId, stockQuantity: product.stockQuantity }, data: { stockQuantity: { increment: line.quantity }, costPrice: resultingCost } });
        await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: line.source.productId, type: "RETURN_IN", quantityChanged: line.quantity, unitCost: historicalCost, reference: number } });
      }
    }
    await tx.creditNote.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, salesOrderId: order.id, customerReturnId: customerReturn.id, number: noteNumber, reason: data.reason || "Customer return", amount: total, appliedAmount: 0, remainingAmount: total, status: "OPEN", reference: number, notes: data.notes || null } });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, type: "SALES_RETURN", credit: total, description: `Customer return ${number}`, referenceId: customerReturn.id } });
    await tx.customer.update({ where: { id: order.customerId }, data: { currentBalance: { decrement: total } } });
    await postCustomerReturnToGeneralLedger(tx, { workspaceId: context.workspaceId, returnId: customerReturn.id, documentNo: number, date: customerReturn.date, amount: total, inventoryCost });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "customer_return.created", entityType: "CustomerReturn", entityId: customerReturn.id, metadata: { salesOrderId: order.id, total: total.toString() } });
    return customerReturn;
  });
}

export async function cancelSale(context: ServiceContext, id: string, reverseInitialPayment: boolean) {
  return withSerializableRetry(async (tx) => {
    const order = await tx.salesOrder.findFirst({ where: { id, workspaceId: context.workspaceId }, include: { items: true, returns: { select: { id: true }, take: 1 }, invoices: { include: { payments: { where: { isReversed: false }, orderBy: { createdAt: "asc" } }, allocations: { where: { payment: { isReversed: false } }, select: { id: true } } } } } });
    if (!order) throw new SaleDomainError("CUSTOMER_NOT_FOUND", "Sale not found.");
    if (order.status === "CANCELLED") return { id: order.id };
    const invoice = order.invoices[0];
    const activePayments = invoice?.payments ?? [];
    const initial = activePayments.find((payment) => payment.notes === "Payment received with sale");
    const laterPayments = activePayments.filter((payment) => payment.id !== initial?.id);
    if (order.returns.length) throw new SaleDomainError("INVALID_RETURN", "Sale cannot be cancelled after customer returns have been recorded.");
    if (laterPayments.length || (invoice?.allocations.length ?? 0) > 0) throw new SaleDomainError("INVALID_TOTAL", "Sale cannot be cancelled after later payments have been recorded.");
    if (initial && !reverseInitialPayment) throw new SaleDomainError("INVALID_TOTAL", "Explicitly confirm reversal of the initial sale payment.");

    const saleCosts = await tx.inventoryTransaction.findMany({ where: { workspaceId: context.workspaceId, reference: order.orderNumber, type: "SALE" }, select: { productId: true, unitCost: true } });
    for (const item of order.items) {
      const historicalCost = saleCosts.find((entry) => entry.productId === item.productId)?.unitCost ?? new Prisma.Decimal(0);
      const product = await tx.product.findFirstOrThrow({ where: { id: item.productId, workspaceId: context.workspaceId }, select: { stockQuantity: true, costPrice: true } });
      const currentStock = product.stockQuantity.toNumber();
      const itemQty = item.quantity.toNumber();
      const resultingQuantity = currentStock + itemQty;
      const resultingCost = product.costPrice.mul(currentStock).plus(historicalCost.mul(itemQty)).div(resultingQuantity);
      const changed = await tx.product.updateMany({ where: { id: item.productId, workspaceId: context.workspaceId, stockQuantity: product.stockQuantity }, data: { stockQuantity: { increment: itemQty }, costPrice: resultingCost } });
      if (changed.count !== 1) throw new SaleDomainError("INVALID_TOTAL", "Inventory changed while cancelling this sale. Retry the cancellation.");
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: item.productId, type: "SALE_CANCELLATION", quantityChanged: itemQty, unitCost: historicalCost, reference: order.orderNumber } });
    }
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, type: "REVERSAL", credit: order.total, description: `Cancelled sale ${order.orderNumber}`, referenceId: order.id } });
    await tx.customer.update({ where: { id: order.customerId }, data: { currentBalance: { decrement: order.total } } });
    if (initial) {
      const reversal = await tx.payment.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, invoiceId: invoice?.id, cashBankAccountId: initial.cashBankAccountId, amount: initial.amount, method: initial.method, reference: `REV-${initial.reference ?? initial.id}`, notes: "Initial sale payment reversal", reversalOfId: initial.id } });
      await tx.payment.update({ where: { id: initial.id }, data: { isReversed: true, reversedAt: new Date() } });
      await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, type: "REVERSAL", debit: initial.amount, description: `Reversed payment ${initial.reference ?? initial.id}`, referenceId: reversal.id } });
      await tx.customer.update({ where: { id: order.customerId }, data: { currentBalance: { increment: initial.amount } } });
      if (initial.cashBankAccountId) await tx.cashBankAccount.update({ where: { id: initial.cashBankAccountId }, data: { currentBalance: { decrement: initial.amount } } });
    }
    await reverseGeneralLedgerEntries(tx, { workspaceId: context.workspaceId, sources: [{ sourceType: "SALE", sourceId: order.id }, { sourceType: "RECEIPT", sourceId: order.id }], documentNo: `REV-${order.orderNumber}`, date: new Date(), reason: `Cancelled sale ${order.orderNumber}`, reversedById: context.userId });
    if (invoice) await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED", paidAmount: 0 } });
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", paidAmount: 0, balanceAmount: 0, cancelledAt: new Date(), cancelledById: context.userId } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "sale.cancelled", entityType: "SalesOrder", entityId: order.id, metadata: { initialPaymentReversed: Boolean(initial) } });
    return { id: order.id };
  });
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
