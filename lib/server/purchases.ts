import "server-only";

import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/server/audit";
import { postPurchaseToGeneralLedger, postSupplierReturnToGeneralLedger } from "@/lib/server/accounting";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import type { ServiceContext } from "@/lib/server/sales";
import { purchaseSchema, type PurchaseInput } from "@/lib/validation/purchase";
import { supplierReturnSchema, type SupplierReturnInput } from "@/lib/validation/returns";

export class PurchaseDomainError extends Error { constructor(public code: "SUPPLIER_NOT_FOUND" | "PRODUCT_NOT_FOUND" | "INVALID_PAYMENT" | "PURCHASE_NOT_FOUND" | "INSUFFICIENT_STOCK" | "INVALID_RETURN", message: string) { super(message); } }

export async function createPurchase(context: ServiceContext, input: PurchaseInput) {
  const data = purchaseSchema.parse(input);
  return db.$transaction(async (tx) => {
    const existing = await tx.purchaseOrder.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true } });
    if (existing) return existing;
    const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, workspaceId: context.workspaceId }, select: { id: true } });
    if (!supplier) throw new PurchaseDomainError("SUPPLIER_NOT_FOUND", "Supplier not found.");
    const ids = [...new Set(data.items.map((item) => item.productId))];
    if (ids.length !== data.items.length) throw new PurchaseDomainError("PRODUCT_NOT_FOUND", "Duplicate products are not allowed.");
    const products = await tx.product.findMany({ where: { workspaceId: context.workspaceId, id: { in: ids }, status: { not: "ARCHIVED" } }, select: { id: true, name: true, sku: true } });
    if (products.length !== data.items.length) throw new PurchaseDomainError("PRODUCT_NOT_FOUND", "One or more products are unavailable.");
    const lines = data.items.map((item) => ({ ...item, total: new Prisma.Decimal(item.unitCost).mul(item.quantity), product: products.find((product) => product.id === item.productId)! }));
    const total = lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0)); const paid = new Prisma.Decimal(data.paidAmount);
    if (paid.greaterThan(total)) throw new PurchaseDomainError("INVALID_PAYMENT", "Payment cannot exceed purchase total.");
    const orderNumber = await nextDocumentNumber(tx, context.workspaceId, "PURCHASE_ORDER");
    const order = await tx.purchaseOrder.create({ data: { workspaceId: context.workspaceId, supplierId: supplier.id, orderNumber, status: "RECEIVED", totalAmount: total, paidAmount: paid, balanceAmount: total.minus(paid), idempotencyKey: data.idempotencyKey, notes: data.notes || null }, select: { id: true, orderDate: true } });
    for (const line of lines) {
      await tx.purchaseOrderItem.create({ data: { purchaseOrderId: order.id, productId: line.productId, productName: line.product.name, productSku: line.product.sku, quantity: line.quantity, unitCost: line.unitCost, totalCost: line.total } });
      await tx.product.update({ where: { id: line.productId }, data: { stockQuantity: { increment: line.quantity }, costPrice: line.unitCost } });
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: line.productId, type: "PURCHASE", quantityChanged: line.quantity, unitCost: line.unitCost, reference: orderNumber } });
    }
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, supplierId: supplier.id, type: "PURCHASE", credit: total, description: `Purchase ${orderNumber}`, referenceId: order.id } });
    await tx.supplier.update({ where: { id: supplier.id }, data: { currentBalance: { increment: total.minus(paid) } } });
    if (paid.greaterThan(0)) {
      const paymentNumber = await nextDocumentNumber(tx, context.workspaceId, "PAYMENT_RECEIPT");
      const payment = await tx.payment.create({ data: { workspaceId: context.workspaceId, supplierId: supplier.id, amount: paid, method: data.paymentMethod, reference: paymentNumber, notes: "Payment made with purchase" } });
      await tx.paymentAllocation.create({ data: { workspaceId: context.workspaceId, paymentId: payment.id, purchaseOrderId: order.id, amount: paid } });
      await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, supplierId: supplier.id, type: "PAYMENT_MADE", debit: paid, description: `Supplier payment ${paymentNumber}`, referenceId: payment.id } });
    }
    await postPurchaseToGeneralLedger(tx, { workspaceId: context.workspaceId, purchaseId: order.id, orderNumber, date: order.orderDate, inventoryAmount: total, cashPaid: paid });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "purchase.created", entityType: "PurchaseOrder", entityId: order.id, metadata: { orderNumber, total: total.toString() } });
    return order;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function cancelPurchase(context: ServiceContext, id: string, reverseInitialPayment: boolean) {
  return db.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({ where: { id, workspaceId: context.workspaceId }, include: { items: true, paymentAllocations: { include: { payment: true }, orderBy: { createdAt: "asc" } } } });
    if (!order) throw new PurchaseDomainError("PURCHASE_NOT_FOUND", "Purchase not found.");
    if (order.status === "CANCELLED") return { id: order.id };
    if (order.paymentAllocations.length > 1) throw new PurchaseDomainError("INVALID_PAYMENT", "Purchase cannot be cancelled after later payments have been allocated.");
    const initialAllocation = order.paymentAllocations[0];
    if (initialAllocation && initialAllocation.payment.notes !== "Payment made with purchase") throw new PurchaseDomainError("INVALID_PAYMENT", "Purchase cannot be cancelled after later payments have been allocated.");
    if (initialAllocation && !reverseInitialPayment) throw new PurchaseDomainError("INVALID_PAYMENT", "Explicitly confirm reversal of the initial purchase payment.");
    if (!initialAllocation && order.paidAmount.greaterThan(0)) throw new PurchaseDomainError("INVALID_PAYMENT", "Purchase payment history is not linked for safe cancellation.");

    for (const item of order.items) {
      const changed = await tx.product.updateMany({ where: { id: item.productId, workspaceId: context.workspaceId, stockQuantity: { gte: item.quantity } }, data: { stockQuantity: { decrement: item.quantity } } });
      if (changed.count !== 1) throw new PurchaseDomainError("INSUFFICIENT_STOCK", `${item.productName ?? "Product"} has insufficient stock to cancel this purchase.`);
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: item.productId, type: "PURCHASE_CANCELLATION", quantityChanged: -item.quantity, unitCost: item.unitCost, reference: order.orderNumber } });
    }
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, supplierId: order.supplierId, type: "REVERSAL", debit: order.totalAmount, description: `Cancelled purchase ${order.orderNumber}`, referenceId: order.id } });
    await tx.supplier.update({ where: { id: order.supplierId }, data: { currentBalance: { decrement: order.totalAmount.minus(order.paidAmount) } } });
    if (initialAllocation) {
      const initial = initialAllocation.payment;
      const reversal = await tx.payment.create({ data: { workspaceId: context.workspaceId, supplierId: order.supplierId, amount: initial.amount, method: initial.method, reference: `REV-${initial.reference ?? initial.id}`, notes: "Initial purchase payment reversal", reversalOfId: initial.id } });
      await tx.payment.update({ where: { id: initial.id }, data: { isReversed: true, reversedAt: new Date() } });
      await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, supplierId: order.supplierId, type: "REVERSAL", credit: initial.amount, description: `Reversed supplier payment ${initial.reference ?? initial.id}`, referenceId: reversal.id } });
    }
    await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", paidAmount: 0, balanceAmount: 0, cancelledAt: new Date(), cancelledById: context.userId } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "purchase.cancelled", entityType: "PurchaseOrder", entityId: order.id, metadata: { initialPaymentReversed: Boolean(initialAllocation) } });
    return { id: order.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function createSupplierReturn(context: ServiceContext, input: SupplierReturnInput) {
  const data = supplierReturnSchema.parse(input);
  return db.$transaction(async (tx) => {
    if (data.idempotencyKey) {
      const existing = await tx.supplierReturn.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true } });
      if (existing) return existing;
    }
    const order = await tx.purchaseOrder.findFirst({ where: { id: data.purchaseOrderId, workspaceId: context.workspaceId, status: { not: "CANCELLED" } }, include: { items: true } });
    if (!order) throw new PurchaseDomainError("PURCHASE_NOT_FOUND", "Purchase not found.");
    const itemIds = data.items.map((item) => item.itemId);
    if (new Set(itemIds).size !== itemIds.length) throw new PurchaseDomainError("INVALID_RETURN", "Duplicate return items are not allowed.");
    const previous = await tx.supplierReturnItem.groupBy({ by: ["purchaseOrderItemId"], where: { purchaseOrderItemId: { in: itemIds }, supplierReturn: { workspaceId: context.workspaceId } }, _sum: { quantity: true } });
    const lines = data.items.map((item) => {
      const source = order.items.find((entry) => entry.id === item.itemId);
      const returned = previous.find((entry) => entry.purchaseOrderItemId === item.itemId)?._sum.quantity ?? 0;
      if (!source || item.quantity > source.quantity - returned) throw new PurchaseDomainError("INVALID_RETURN", "Return quantity exceeds purchased quantity.");
      const total = source.unitCost.mul(item.quantity);
      return { source, quantity: item.quantity, total };
    });
    const total = lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0));
    const number = await nextDocumentNumber(tx, context.workspaceId, "SUPPLIER_RETURN");
    const noteNumber = await nextDocumentNumber(tx, context.workspaceId, "DEBIT_NOTE");
    const supplierReturn = await tx.supplierReturn.create({ data: { workspaceId: context.workspaceId, supplierId: order.supplierId, purchaseOrderId: order.id, idempotencyKey: data.idempotencyKey, number, reason: data.reason || null, totalAmount: total, notes: data.notes || null }, select: { id: true, date: true } });
    for (const line of lines) {
      const changed = await tx.product.updateMany({ where: { id: line.source.productId, workspaceId: context.workspaceId, stockQuantity: { gte: line.quantity } }, data: { stockQuantity: { decrement: line.quantity } } });
      if (changed.count !== 1) throw new PurchaseDomainError("INSUFFICIENT_STOCK", `${line.source.productName ?? "Product"} has insufficient stock to return.`);
      await tx.supplierReturnItem.create({ data: { supplierReturnId: supplierReturn.id, purchaseOrderItemId: line.source.id, productId: line.source.productId, quantity: line.quantity, unitCost: line.source.unitCost, totalCost: line.total } });
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: line.source.productId, type: "RETURN_OUT", quantityChanged: -line.quantity, unitCost: line.source.unitCost, reference: number } });
    }
    await tx.debitNote.create({ data: { workspaceId: context.workspaceId, supplierId: order.supplierId, purchaseOrderId: order.id, number: noteNumber, reason: data.reason || "Supplier return", amount: total, reference: number, notes: data.notes || null } });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, supplierId: order.supplierId, type: "PURCHASE_RETURN", debit: total, description: `Supplier return ${number}`, referenceId: supplierReturn.id } });
    await tx.supplier.update({ where: { id: order.supplierId }, data: { currentBalance: { decrement: total } } });
    await postSupplierReturnToGeneralLedger(tx, { workspaceId: context.workspaceId, returnId: supplierReturn.id, documentNo: number, date: supplierReturn.date, amount: total });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "supplier_return.created", entityType: "SupplierReturn", entityId: supplierReturn.id, metadata: { purchaseOrderId: order.id, total: total.toString() } });
    return supplierReturn;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function listPurchases(workspaceId: string) {
  const rows = await db.purchaseOrder.findMany({ where: { workspaceId }, include: { supplier: { select: { name: true, companyName: true } }, _count: { select: { items: true } } }, orderBy: { orderDate: "desc" } });
  return rows.map((row) => ({ id: row.id, orderNumber: row.orderNumber, supplierName: row.supplier.companyName ?? row.supplier.name, date: row.orderDate.toISOString(), status: row.status, items: row._count.items, total: Number(row.totalAmount), paid: Number(row.paidAmount), balance: Number(row.balanceAmount) }));
}

export async function getPurchase(workspaceId: string, id: string) {
  const row = await db.purchaseOrder.findFirst({ where: { id, workspaceId }, include: { supplier: true, items: { include: { product: { select: { name: true, sku: true } } } } } });
  if (!row) return null;
  const items = row.items.map((item) => ({ id: item.id, productId: item.productId, productName: item.productName ?? item.product.name, sku: item.productSku ?? item.product.sku ?? "", quantity: item.quantity, unitCost: Number(item.unitCost), total: Number(item.totalCost) }));
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const total = Number(row.totalAmount);
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    date: row.orderDate.toISOString(),
    status: row.status,
    notes: row.notes ?? "",
    subtotal,
    discount: Math.max(0, subtotal - total),
    total,
    paid: Number(row.paidAmount),
    outstanding: Number(row.balanceAmount),
    supplier: { id: row.supplier.id, name: row.supplier.name, companyName: row.supplier.companyName ?? row.supplier.name, phone: row.supplier.phone ?? "", currentBalance: Number(row.supplier.currentBalance) },
    items,
  };
}
