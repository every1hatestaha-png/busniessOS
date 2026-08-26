import "server-only";

import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import type { ServiceContext } from "@/lib/server/sales";
import { purchaseSchema, type PurchaseInput } from "@/lib/validation/purchase";

export class PurchaseDomainError extends Error { constructor(public code: "SUPPLIER_NOT_FOUND" | "PRODUCT_NOT_FOUND" | "INVALID_PAYMENT", message: string) { super(message); } }

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
    const order = await tx.purchaseOrder.create({ data: { workspaceId: context.workspaceId, supplierId: supplier.id, orderNumber, status: "RECEIVED", totalAmount: total, paidAmount: paid, balanceAmount: total.minus(paid), idempotencyKey: data.idempotencyKey, notes: data.notes || null }, select: { id: true } });
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
      await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, supplierId: supplier.id, type: "PAYMENT_MADE", debit: paid, description: `Supplier payment ${paymentNumber}`, referenceId: payment.id } });
    }
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "purchase.created", entityType: "PurchaseOrder", entityId: order.id, metadata: { orderNumber, total: total.toString() } });
    return order;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function listPurchases(workspaceId: string) {
  const rows = await db.purchaseOrder.findMany({ where: { workspaceId }, include: { supplier: { select: { name: true, companyName: true } }, _count: { select: { items: true } } }, orderBy: { orderDate: "desc" } });
  return rows.map((row) => ({ id: row.id, orderNumber: row.orderNumber, supplierName: row.supplier.companyName ?? row.supplier.name, date: row.orderDate.toISOString(), status: row.status, items: row._count.items, total: Number(row.totalAmount), paid: Number(row.paidAmount), balance: Number(row.balanceAmount) }));
}
