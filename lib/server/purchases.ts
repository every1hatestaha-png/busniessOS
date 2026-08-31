import "server-only";

import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/server/audit";
import { postGoodsReceiptToGeneralLedger, postSupplierReturnToGeneralLedger, reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import type { ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { purchaseSchema, goodsReceiptSchema, type PurchaseInput, type GoodsReceiptInput } from "@/lib/validation/purchase";
import { supplierReturnSchema, type SupplierReturnInput } from "@/lib/validation/returns";

export class PurchaseDomainError extends Error {
  constructor(
    public code:
      | "SUPPLIER_NOT_FOUND"
      | "PRODUCT_NOT_FOUND"
      | "INVALID_PAYMENT"
      | "PURCHASE_NOT_FOUND"
      | "INSUFFICIENT_STOCK"
      | "INVALID_RETURN"
      | "INVALID_RECEIPT"
      | "OVER_RECEIPT"
      | "CANCELLED_PO"
      | "RECEIPT_NOT_ALLOWED",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Create a Purchase Order (commercial commitment only).
 * No inventory, no payable, no GL, no supplier balance changes.
 * Status defaults to ORDERED.
 */
export async function createPurchase(context: ServiceContext, input: PurchaseInput) {
  const data = purchaseSchema.parse(input);
  return withSerializableRetry(async (tx) => {
    const existing = await tx.purchaseOrder.findFirst({
      where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey },
      select: { id: true, orderNumber: true },
    });
    if (existing) return existing;

    const supplier = await tx.supplier.findFirst({
      where: { id: data.supplierId, workspaceId: context.workspaceId },
      select: { id: true },
    });
    if (!supplier) throw new PurchaseDomainError("SUPPLIER_NOT_FOUND", "Supplier not found.");

    const ids = [...new Set(data.items.map((item) => item.productId))];
    if (ids.length !== data.items.length) throw new PurchaseDomainError("PRODUCT_NOT_FOUND", "Duplicate products are not allowed.");

    const products = await tx.product.findMany({
      where: { workspaceId: context.workspaceId, id: { in: ids }, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, sku: true },
    });
    if (products.length !== data.items.length) throw new PurchaseDomainError("PRODUCT_NOT_FOUND", "One or more products are unavailable.");

    const lines = data.items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      const unitCost = data.pricingMode === "WEIGHT"
        ? new Prisma.Decimal(item.unitWeight!).mul(item.perKgRate!)
        : new Prisma.Decimal(item.unitCost);
      const totalCost = unitCost.mul(item.quantity);
      return { ...item, unitCost, totalCost, product };
    });

    const total = lines.reduce((sum, line) => sum.plus(line.totalCost), new Prisma.Decimal(0));
    const orderNumber = await nextDocumentNumber(tx, context.workspaceId, "PURCHASE_ORDER");

    const order = await tx.purchaseOrder.create({
      data: {
        workspaceId: context.workspaceId,
        supplierId: supplier.id,
        orderNumber,
        status: "ORDERED",
        totalAmount: total,
        paidAmount: 0,
        balanceAmount: 0,
        idempotencyKey: data.idempotencyKey,
        notes: data.notes || null,
        expectedDeliveryDate: data.expectedDeliveryDate || null,
        department: data.department || null,
        pricingMode: data.pricingMode ?? "UNIT",
      },
      select: { id: true, orderNumber: true, orderDate: true },
    });

    for (const line of lines) {
      const itemData: Prisma.PurchaseOrderItemCreateManyInput = {
        purchaseOrderId: order.id,
        productId: line.productId,
        productName: line.product.name,
        productSku: line.product.sku,
        quantity: line.quantity,
        unitCost: line.unitCost,
        totalCost: line.totalCost,
      };

      if (data.pricingMode === "WEIGHT" && line.unitWeight != null && line.perKgRate != null) {
        const totalWeight = new Prisma.Decimal(line.unitWeight).mul(line.quantity);
        itemData.unitWeight = line.unitWeight;
        itemData.totalWeight = totalWeight;
        itemData.perKgRate = line.perKgRate;
      }

      await tx.purchaseOrderItem.create({ data: itemData });
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "purchase.created",
      entityType: "PurchaseOrder",
      entityId: order.id,
      metadata: { orderNumber, total: total.toString(), pricingMode: data.pricingMode },
    });

    return order;
  });
}

/**
 * Post a Goods Receipt Note (GRN) for a purchase order.
 * This is the financial trigger: inventory increases, supplier payable created, GL posted.
 */
export async function createGoodsReceipt(context: ServiceContext, input: GoodsReceiptInput) {
  const data = goodsReceiptSchema.parse(input);
  return withSerializableRetry(async (tx) => {
    if (data.idempotencyKey) {
      const existing = await tx.goodReceivedNote.findFirst({
        where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey },
        select: { id: true, grnNumber: true },
      });
      if (existing) return { id: existing.id, grnNumber: existing.grnNumber, status: "RECEIVED" as const };
    }

    const itemIds = data.items.map((item) => item.purchaseOrderItemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new PurchaseDomainError("INVALID_RECEIPT", "Duplicate purchase order items are not allowed on a GRN.");
    }

    const order = await tx.purchaseOrder.findFirst({
      where: { id: data.purchaseOrderId, workspaceId: context.workspaceId },
      include: { items: true, supplier: true },
    });
    if (!order) throw new PurchaseDomainError("PURCHASE_NOT_FOUND", "Purchase order not found.");
    if (order.status === "CANCELLED") throw new PurchaseDomainError("CANCELLED_PO", "Cannot receive goods for a cancelled purchase order.");

    const grnNumber = await nextDocumentNumber(tx, context.workspaceId, "PURCHASE_RECEIPT");

    let totalAcceptedAmount = new Prisma.Decimal(0);
    const grnItems: Array<{
      purchaseOrderItem: (typeof order.items)[number];
      receivedQuantity: number;
      acceptedQuantity: number;
      unitCost: Prisma.Decimal;
      totalCost: Prisma.Decimal;
    }> = [];

    for (const item of data.items) {
      const poItem = order.items.find((i) => i.id === item.purchaseOrderItemId);
      if (!poItem) throw new PurchaseDomainError("INVALID_RECEIPT", `Purchase order item not found: ${item.purchaseOrderItemId}`);

      if (item.receivedQuantity < 0 || item.acceptedQuantity < 0) {
        throw new PurchaseDomainError("INVALID_RECEIPT", "Received and accepted quantities cannot be negative.");
      }

      if (item.acceptedQuantity > item.receivedQuantity) {
        throw new PurchaseDomainError("INVALID_RECEIPT", "Accepted quantity cannot exceed received quantity.");
      }

      const remainingOrdered = poItem.quantity - poItem.receivedQuantity;
      if (remainingOrdered <= 0) {
        throw new PurchaseDomainError("OVER_RECEIPT", `${poItem.productName ?? "Item"} has already been fully received.`);
      }

      if (item.receivedQuantity > remainingOrdered) {
        throw new PurchaseDomainError("OVER_RECEIPT", `Cannot receive ${item.receivedQuantity} of ${poItem.productName ?? "Item"}. Only ${remainingOrdered} remaining.`);
      }

      const unitCost = new Prisma.Decimal(item.actualUnitCost);
      const totalCost = unitCost.mul(item.acceptedQuantity);
      totalAcceptedAmount = totalAcceptedAmount.plus(totalCost);

      grnItems.push({
        purchaseOrderItem: poItem,
        receivedQuantity: item.receivedQuantity,
        acceptedQuantity: item.acceptedQuantity,
        unitCost,
        totalCost,
      });
    }

    const grn = await tx.goodReceivedNote.create({
      data: {
        workspaceId: context.workspaceId,
        supplierId: order.supplierId,
        purchaseOrderId: order.id,
        grnNumber,
        receiptDate: data.receiptDate || new Date(),
        idempotencyKey: data.idempotencyKey || null,
        notes: data.notes || null,
        receivedBy: data.receivedBy || null,
        checkedBy: data.checkedBy || null,
        totalAmount: totalAcceptedAmount,
      },
      select: { id: true, receiptDate: true },
    });

    for (const item of grnItems) {
      await tx.goodReceivedNoteItem.create({
        data: {
          goodReceivedNoteId: grn.id,
          purchaseOrderItemId: item.purchaseOrderItem.id,
          productId: item.purchaseOrderItem.productId,
          orderedQuantity: item.purchaseOrderItem.quantity,
          receivedQuantity: item.receivedQuantity,
          acceptedQuantity: item.acceptedQuantity,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
        },
      });

      await tx.purchaseOrderItem.update({
        where: { id: item.purchaseOrderItem.id },
        // Rejected units remain open on the PO so replacements can be received.
        data: { receivedQuantity: { increment: item.acceptedQuantity } },
      });

      const product = await tx.product.findFirstOrThrow({
        where: { id: item.purchaseOrderItem.productId, workspaceId: context.workspaceId },
        select: { stockQuantity: true, costPrice: true },
      });
      const resultingQuantity = product.stockQuantity + item.acceptedQuantity;
      const weightedCost = resultingQuantity > 0
        ? product.costPrice.mul(product.stockQuantity).plus(item.unitCost.mul(item.acceptedQuantity)).div(resultingQuantity)
        : item.unitCost;
      await tx.product.update({
        where: { id: item.purchaseOrderItem.productId },
        data: { stockQuantity: { increment: item.acceptedQuantity }, costPrice: weightedCost },
      });

      await tx.inventoryTransaction.create({
        data: {
          workspaceId: context.workspaceId,
          productId: item.purchaseOrderItem.productId,
          type: "PURCHASE_RECEIPT",
          quantityChanged: item.acceptedQuantity,
          unitCost: item.unitCost,
          reference: grnNumber,
        },
      });
    }

    await tx.ledgerEntry.create({
      data: {
        workspaceId: context.workspaceId,
        supplierId: order.supplierId,
        type: "GOODS_RECEIVED",
        credit: totalAcceptedAmount,
        description: `Goods received ${grnNumber} (PO ${order.orderNumber})`,
        referenceId: grn.id,
      },
    });

    await tx.supplier.update({
      where: { id: order.supplierId },
      data: { currentBalance: { increment: totalAcceptedAmount } },
    });

    await postGoodsReceiptToGeneralLedger(tx, {
      workspaceId: context.workspaceId,
      grnId: grn.id,
      grnNumber,
      date: grn.receiptDate,
      inventoryAmount: totalAcceptedAmount,
    });

    const allFullyReceived = grnItems.every(
      (item) => item.purchaseOrderItem.receivedQuantity + item.acceptedQuantity >= item.purchaseOrderItem.quantity,
    );
    const anyReceived = grnItems.some((item) => item.acceptedQuantity > 0);
    const totalReceivedAllItems = await tx.purchaseOrderItem.aggregate({
      where: { purchaseOrderId: order.id },
      _sum: { receivedQuantity: true },
    });
    const totalOrderedAllItems = await tx.purchaseOrderItem.aggregate({
      where: { purchaseOrderId: order.id },
      _sum: { quantity: true },
    });
    const totalReceived = Number(totalReceivedAllItems._sum.receivedQuantity ?? 0);
    const totalOrdered = Number(totalOrderedAllItems._sum.quantity ?? 0);

    let newStatus: "PARTIALLY_RECEIVED" | "RECEIVED";
    if (totalReceived >= totalOrdered) {
      newStatus = "RECEIVED";
    } else {
      newStatus = "PARTIALLY_RECEIVED";
    }

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: newStatus,
        balanceAmount: { increment: totalAcceptedAmount },
      },
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: anyReceived && !allFullyReceived ? "grn.partial_received" : "grn.received",
      entityType: "GoodReceivedNote",
      entityId: grn.id,
      metadata: {
        grnNumber,
        purchaseOrderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: totalAcceptedAmount.toString(),
        status: newStatus,
      },
    });

    return { id: grn.id, grnNumber, status: newStatus };
  });
}

export async function cancelPurchase(context: ServiceContext, id: string, reverseInitialPayment: boolean) {
  return withSerializableRetry(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: { id, workspaceId: context.workspaceId },
      include: { items: true, returns: { select: { id: true }, take: 1 }, paymentAllocations: { include: { payment: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!order) throw new PurchaseDomainError("PURCHASE_NOT_FOUND", "Purchase not found.");
    if (order.status === "CANCELLED") return { id: order.id };

    if (order.status === "RECEIVED" || order.status === "PARTIALLY_RECEIVED") {
      const hasGrn = await tx.goodReceivedNote.count({ where: { purchaseOrderId: id } });
      if (hasGrn > 0) {
        const grns = await tx.goodReceivedNote.findMany({ where: { purchaseOrderId: id, workspaceId: context.workspaceId }, select: { id: true } });
        const receiptItems = await tx.goodReceivedNoteItem.groupBy({
          by: ["purchaseOrderItemId"],
          where: { goodReceivedNote: { purchaseOrderId: id, workspaceId: context.workspaceId } },
          _sum: { acceptedQuantity: true, totalCost: true },
        });
        const receiptByItem = new Map(receiptItems.map((item) => [item.purchaseOrderItemId, item]));
        const grnTotal = receiptItems.reduce((sum, item) => sum.plus(item._sum.totalCost ?? 0), new Prisma.Decimal(0));

        if (order.returns.length) {
          throw new PurchaseDomainError("INVALID_RETURN", "Purchase cannot be cancelled after supplier returns have been recorded.");
        }
        if (order.paymentAllocations.length > 1) {
          throw new PurchaseDomainError("INVALID_PAYMENT", "Purchase cannot be cancelled after later payments have been allocated.");
        }
        const initialAllocation = order.paymentAllocations[0];
        if (initialAllocation && initialAllocation.payment.notes !== "Payment made with purchase") {
          throw new PurchaseDomainError("INVALID_PAYMENT", "Purchase cannot be cancelled after later payments have been allocated.");
        }
        if (initialAllocation && !reverseInitialPayment) {
          throw new PurchaseDomainError("INVALID_PAYMENT", "Explicitly confirm reversal of the initial purchase payment.");
        }
        if (!initialAllocation && !reverseInitialPayment) {
          throw new PurchaseDomainError("INVALID_PAYMENT", "Explicitly confirm cancellation of received purchase.");
        }

        for (const item of order.items) {
          const acceptedQuantity = receiptByItem.get(item.id)?._sum.acceptedQuantity ?? 0;
          if (acceptedQuantity > 0) {
            const cancelledValue = receiptByItem.get(item.id)?._sum.totalCost ?? new Prisma.Decimal(0);
            const cancelledUnitCost = new Prisma.Decimal(cancelledValue).div(acceptedQuantity);
            const product = await tx.product.findFirst({ where: { id: item.productId, workspaceId: context.workspaceId, stockQuantity: { gte: acceptedQuantity } }, select: { stockQuantity: true, costPrice: true } });
            if (!product) throw new PurchaseDomainError("INSUFFICIENT_STOCK", `${item.productName ?? "Product"} has insufficient stock to cancel this purchase.`);
            const remainingQuantity = product.stockQuantity - acceptedQuantity;
            const remainingValue = product.costPrice.mul(product.stockQuantity).minus(cancelledValue);
            if (remainingValue.isNegative()) throw new PurchaseDomainError("INSUFFICIENT_STOCK", `${item.productName ?? "Product"} carrying value is insufficient to cancel this purchase.`);
            const changed = await tx.product.updateMany({
              where: { id: item.productId, workspaceId: context.workspaceId, stockQuantity: product.stockQuantity },
              data: { stockQuantity: { decrement: acceptedQuantity }, ...(remainingQuantity > 0 ? { costPrice: remainingValue.div(remainingQuantity) } : {}) },
            });
            if (changed.count !== 1) {
              throw new PurchaseDomainError("INSUFFICIENT_STOCK", `${item.productName ?? "Product"} has insufficient stock to cancel this purchase.`);
            }
            await tx.inventoryTransaction.create({
              data: {
                workspaceId: context.workspaceId,
                productId: item.productId,
                type: "PURCHASE_CANCELLATION",
                quantityChanged: -acceptedQuantity,
                unitCost: cancelledUnitCost,
                reference: order.orderNumber,
              },
            });
          }
        }

        await tx.ledgerEntry.create({
          data: {
            workspaceId: context.workspaceId,
            supplierId: order.supplierId,
            type: "REVERSAL",
            debit: grnTotal,
            description: `Cancelled purchase ${order.orderNumber}`,
            referenceId: order.id,
          },
        });

        await tx.supplier.update({
          where: { id: order.supplierId },
          data: { currentBalance: { decrement: grnTotal.minus(order.paidAmount) } },
        });

        if (order.paymentAllocations[0]) {
          const initial = order.paymentAllocations[0].payment;
          const reversal = await tx.payment.create({
            data: {
              workspaceId: context.workspaceId,
              supplierId: order.supplierId,
              amount: initial.amount,
              method: initial.method,
              reference: `REV-${initial.reference ?? initial.id}`,
              notes: "Initial purchase payment reversal",
              reversalOfId: initial.id,
            },
          });
          await tx.payment.update({ where: { id: initial.id }, data: { isReversed: true, reversedAt: new Date() } });
          await tx.ledgerEntry.create({
            data: {
              workspaceId: context.workspaceId,
              supplierId: order.supplierId,
              type: "REVERSAL",
              credit: initial.amount,
              description: `Reversed supplier payment ${initial.reference ?? initial.id}`,
              referenceId: reversal.id,
            },
          });
        }

        await reverseGeneralLedgerEntries(tx, { workspaceId: context.workspaceId, sources: grns.map((grn) => ({ sourceType: "PURCHASE_RECEIPT", sourceId: grn.id })), documentNo: `REV-${order.orderNumber}`, date: new Date(), reason: `Cancelled purchase ${order.orderNumber}`, reversedById: context.userId });
      }
    }

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: "CANCELLED", paidAmount: 0, balanceAmount: 0, cancelledAt: new Date(), cancelledById: context.userId },
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "purchase.cancelled",
      entityType: "PurchaseOrder",
      entityId: order.id,
      metadata: { hadGrn: order.status === "RECEIVED" || order.status === "PARTIALLY_RECEIVED" },
    });

    return { id: order.id };
  });
}

export async function createSupplierReturn(context: ServiceContext, input: SupplierReturnInput) {
  const data = supplierReturnSchema.parse(input);
  return withSerializableRetry(async (tx) => {
    if (data.idempotencyKey) {
      const existing = await tx.supplierReturn.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true } });
      if (existing) return existing;
    }
    const order = await tx.purchaseOrder.findFirst({ where: { id: data.purchaseOrderId, workspaceId: context.workspaceId, status: { not: "CANCELLED" } }, include: { items: true } });
    if (!order) throw new PurchaseDomainError("PURCHASE_NOT_FOUND", "Purchase not found.");
    const itemIds = data.items.map((item) => item.itemId);
    if (new Set(itemIds).size !== itemIds.length) throw new PurchaseDomainError("INVALID_RETURN", "Duplicate return items are not allowed.");
    const [previous, received] = await Promise.all([
      tx.supplierReturnItem.groupBy({ by: ["purchaseOrderItemId"], where: { purchaseOrderItemId: { in: itemIds }, supplierReturn: { workspaceId: context.workspaceId } }, _sum: { quantity: true } }),
      tx.goodReceivedNoteItem.groupBy({ by: ["purchaseOrderItemId"], where: { purchaseOrderItemId: { in: itemIds }, goodReceivedNote: { workspaceId: context.workspaceId, purchaseOrderId: order.id } }, _sum: { acceptedQuantity: true, totalCost: true } }),
    ]);
    const lines = data.items.map((item) => {
      const source = order.items.find((entry) => entry.id === item.itemId);
      const returned = previous.find((entry) => entry.purchaseOrderItemId === item.itemId)?._sum.quantity ?? 0;
      const receipt = received.find((entry) => entry.purchaseOrderItemId === item.itemId);
      const acceptedQuantity = receipt?._sum.acceptedQuantity ?? 0;
      if (!source || item.quantity > acceptedQuantity - returned) throw new PurchaseDomainError("INVALID_RETURN", "Return quantity exceeds received quantity.");
      const receivedTotalCost = receipt?._sum.totalCost ?? new Prisma.Decimal(0);
      const unitCost = acceptedQuantity > 0 ? receivedTotalCost.div(acceptedQuantity) : source.unitCost;
      const total = unitCost.mul(item.quantity);
      return { source, quantity: item.quantity, unitCost, total };
    });
    const total = lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0));
    if (total.greaterThan(order.balanceAmount)) throw new PurchaseDomainError("INVALID_RETURN", "Supplier return exceeds the unpaid purchase balance. Returns requiring a supplier refund are not supported in V1.");
    const number = await nextDocumentNumber(tx, context.workspaceId, "SUPPLIER_RETURN");
    const noteNumber = await nextDocumentNumber(tx, context.workspaceId, "DEBIT_NOTE");
    const supplierReturn = await tx.supplierReturn.create({ data: { workspaceId: context.workspaceId, supplierId: order.supplierId, purchaseOrderId: order.id, idempotencyKey: data.idempotencyKey, number, reason: data.reason || null, totalAmount: total, notes: data.notes || null }, select: { id: true, date: true } });
    for (const line of lines) {
      const product = await tx.product.findFirst({ where: { id: line.source.productId, workspaceId: context.workspaceId, stockQuantity: { gte: line.quantity } }, select: { stockQuantity: true, costPrice: true } });
      if (!product) throw new PurchaseDomainError("INSUFFICIENT_STOCK", `${line.source.productName ?? "Product"} has insufficient stock to return.`);
      const remainingQuantity = product.stockQuantity - line.quantity;
      const remainingValue = product.costPrice.mul(product.stockQuantity).minus(line.total);
      if (remainingValue.isNegative()) throw new PurchaseDomainError("INVALID_RETURN", "Return value exceeds the current inventory carrying value.");
      const changed = await tx.product.updateMany({ where: { id: line.source.productId, workspaceId: context.workspaceId, stockQuantity: product.stockQuantity }, data: { stockQuantity: { decrement: line.quantity }, ...(remainingQuantity > 0 ? { costPrice: remainingValue.div(remainingQuantity) } : {}) } });
      if (changed.count !== 1) throw new PurchaseDomainError("INSUFFICIENT_STOCK", `${line.source.productName ?? "Product"} has insufficient stock to return.`);
      await tx.supplierReturnItem.create({ data: { supplierReturnId: supplierReturn.id, purchaseOrderItemId: line.source.id, productId: line.source.productId, quantity: line.quantity, unitCost: line.unitCost, totalCost: line.total } });
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: line.source.productId, type: "RETURN_OUT", quantityChanged: -line.quantity, unitCost: line.unitCost, reference: number } });
    }
    await tx.debitNote.create({ data: { workspaceId: context.workspaceId, supplierId: order.supplierId, purchaseOrderId: order.id, number: noteNumber, reason: data.reason || "Supplier return", amount: total, reference: number, notes: data.notes || null } });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, supplierId: order.supplierId, type: "PURCHASE_RETURN", debit: total, description: `Supplier return ${number}`, referenceId: supplierReturn.id } });
    await tx.supplier.update({ where: { id: order.supplierId }, data: { currentBalance: { decrement: total } } });
    await tx.purchaseOrder.update({ where: { id: order.id }, data: { balanceAmount: { decrement: total } } });
    await postSupplierReturnToGeneralLedger(tx, { workspaceId: context.workspaceId, returnId: supplierReturn.id, documentNo: number, date: supplierReturn.date, amount: total });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "supplier_return.created", entityType: "SupplierReturn", entityId: supplierReturn.id, metadata: { purchaseOrderId: order.id, total: total.toString() } });
    return supplierReturn;
  });
}

export async function listPurchases(workspaceId: string) {
  const rows = await db.purchaseOrder.findMany({
    where: { workspaceId },
    include: {
      supplier: { select: { name: true, companyName: true } },
      _count: { select: { items: true, goodsReceivedNotes: true } },
    },
    orderBy: { orderDate: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    supplierName: row.supplier.companyName ?? row.supplier.name,
    date: row.orderDate.toISOString(),
    status: row.status,
    items: row._count.items,
    grnCount: row._count.goodsReceivedNotes,
    total: Number(row.totalAmount),
    paid: Number(row.paidAmount),
    balance: Number(row.balanceAmount),
  }));
}

export async function getPurchase(workspaceId: string, id: string) {
  const row = await db.purchaseOrder.findFirst({
    where: { id, workspaceId },
    include: {
      supplier: true,
      items: {
        include: { product: { select: { name: true, sku: true } } },
      },
      goodsReceivedNotes: {
        include: {
          items: true,
        },
        orderBy: { receiptDate: "asc" },
      },
    },
  });
  if (!row) return null;

  const items = row.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.productName ?? item.product.name,
    sku: item.productSku ?? item.product.sku ?? "",
    quantity: item.quantity,
    unitCost: Number(item.unitCost),
    total: Number(item.totalCost),
    receivedQuantity: item.receivedQuantity,
    remainingQuantity: item.quantity - item.receivedQuantity,
    unitWeight: item.unitWeight ? Number(item.unitWeight) : null,
    totalWeight: item.totalWeight ? Number(item.totalWeight) : null,
    perKgRate: item.perKgRate ? Number(item.perKgRate) : null,
  }));

  const grns = row.goodsReceivedNotes.map((grn) => ({
    id: grn.id,
    grnNumber: grn.grnNumber,
    receiptDate: grn.receiptDate.toISOString(),
    totalAmount: Number(grn.totalAmount),
    receivedBy: grn.receivedBy,
    checkedBy: grn.checkedBy,
    notes: grn.notes,
    items: grn.items.map((gi) => ({
      id: gi.id,
      purchaseOrderItemId: gi.purchaseOrderItemId,
      acceptedQuantity: gi.acceptedQuantity,
      unitCost: Number(gi.unitCost),
      totalCost: Number(gi.totalCost),
    })),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const total = Number(row.totalAmount);

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    date: row.orderDate.toISOString(),
    status: row.status,
    notes: row.notes ?? "",
    expectedDeliveryDate: row.expectedDeliveryDate?.toISOString() ?? null,
    department: row.department ?? "",
    pricingMode: row.pricingMode,
    subtotal,
    discount: Math.max(0, subtotal - total),
    total,
    paid: Number(row.paidAmount),
    outstanding: Number(row.balanceAmount),
    supplier: {
      id: row.supplier.id,
      name: row.supplier.name,
      companyName: row.supplier.companyName ?? row.supplier.name,
      phone: row.supplier.phone ?? "",
      currentBalance: Number(row.supplier.currentBalance),
    },
    items,
    grns,
  };
}

export async function getOpenPOItemsForGRN(workspaceId: string, purchaseOrderId: string) {
  const order = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, workspaceId, status: { not: "CANCELLED" } },
    include: {
      items: { include: { product: { select: { name: true, sku: true } } } },
      supplier: { select: { name: true, companyName: true } },
    },
  });
  if (!order) return null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    supplier: { id: order.supplierId, name: order.supplier.companyName ?? order.supplier.name },
    items: order.items
      .filter((item) => item.receivedQuantity < item.quantity)
      .map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName ?? item.product.name,
        sku: item.productSku ?? item.product.sku ?? "",
        orderedQuantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        remainingQuantity: item.quantity - item.receivedQuantity,
        unitCost: Number(item.unitCost),
        unitWeight: item.unitWeight ? Number(item.unitWeight) : null,
        totalWeight: item.totalWeight ? Number(item.totalWeight) : null,
        perKgRate: item.perKgRate ? Number(item.perKgRate) : null,
      })),
  };
}

export async function listGoodsReceipts(workspaceId: string, purchaseOrderId: string) {
  const grns = await db.goodReceivedNote.findMany({
    where: { workspaceId, purchaseOrderId },
    include: { items: true },
    orderBy: { receiptDate: "desc" },
  });
  return grns.map((grn) => ({
    id: grn.id,
    grnNumber: grn.grnNumber,
    receiptDate: grn.receiptDate.toISOString(),
    totalAmount: Number(grn.totalAmount),
    receivedBy: grn.receivedBy,
    itemsCount: grn.items.length,
    totalAccepted: grn.items.reduce((sum, i) => sum + i.acceptedQuantity, 0),
  }));
}

export async function listAllGoodsReceipts(workspaceId: string) {
  const rows = await db.goodReceivedNote.findMany({ where: { workspaceId }, orderBy: [{ receiptDate: "desc" }, { createdAt: "desc" }], take: 500, include: { supplier: { select: { name: true, companyName: true } }, purchaseOrder: { select: { orderNumber: true } }, items: { select: { acceptedQuantity: true } } } });
  return rows.map((row) => ({ id: row.id, grnNumber: row.grnNumber, receiptDate: row.receiptDate.toISOString(), supplierName: row.supplier.companyName ?? row.supplier.name, orderNumber: row.purchaseOrder.orderNumber, totalAmount: Number(row.totalAmount), totalAccepted: row.items.reduce((sum, item) => sum + item.acceptedQuantity, 0) }));
}

export async function getGoodsReceipt(workspaceId: string, id: string) {
  const grn = await db.goodReceivedNote.findFirst({
    where: { id, workspaceId },
    include: {
      purchaseOrder: { select: { orderNumber: true, pricingMode: true } },
      supplier: { select: { name: true, companyName: true, phone: true } },
      items: {
        include: {
          purchaseOrderItem: { select: { quantity: true, receivedQuantity: true, unitWeight: true, totalWeight: true, perKgRate: true } },
          product: { select: { name: true, sku: true } },
        },
      },
    },
  });
  if (!grn) return null;

  return {
    id: grn.id,
    grnNumber: grn.grnNumber,
    receiptDate: grn.receiptDate.toISOString(),
    totalAmount: Number(grn.totalAmount),
    receivedBy: grn.receivedBy,
    checkedBy: grn.checkedBy,
    notes: grn.notes,
    purchaseOrder: {
      id: grn.purchaseOrderId,
      orderNumber: grn.purchaseOrder.orderNumber,
      pricingMode: grn.purchaseOrder.pricingMode,
    },
    supplier: {
      id: grn.supplierId,
      name: grn.supplier.companyName ?? grn.supplier.name,
      phone: grn.supplier.phone ?? "",
    },
    items: grn.items.map((item) => ({
      id: item.id,
      productName: item.product.name,
      sku: item.product.sku ?? "",
      orderedQuantity: item.purchaseOrderItem.quantity,
      previouslyReceived: item.purchaseOrderItem.receivedQuantity - item.acceptedQuantity,
      receivedNow: item.receivedQuantity,
      acceptedQuantity: item.acceptedQuantity,
      remainingQuantity: item.purchaseOrderItem.quantity - item.purchaseOrderItem.receivedQuantity,
      unitCost: Number(item.unitCost),
      totalCost: Number(item.totalCost),
      unitWeight: item.purchaseOrderItem.unitWeight ? Number(item.purchaseOrderItem.unitWeight) : null,
    })),
  };
}
