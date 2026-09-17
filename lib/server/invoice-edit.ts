import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { postSaleToGeneralLedger, reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";

export class InvoiceEditError extends Error {}

export type InvoiceFinancialEditInput = {
  customerId: string;
  orderDiscount: number;
  gstRate: number;
  notes: string;
  items: Array<{
    productId: string;
    quantity: number;
    pricingMode: "UNIT" | "WEIGHT";
    unitWeight?: number | null;
    perKgRate?: number | null;
    unitPrice: number;
    discountPerUnit: number;
  }>;
};

function validateAndPrice(input: InvoiceFinancialEditInput) {
  if (!input.customerId) throw new InvoiceEditError("Choose a customer.");
  if (!input.items.length || input.items.length > 100) throw new InvoiceEditError("Add at least one invoice item.");
  if (input.notes.length > 500) throw new InvoiceEditError("Sale notes cannot exceed 500 characters.");
  if (!Number.isFinite(input.orderDiscount) || input.orderDiscount < 0) throw new InvoiceEditError("Order discount is invalid.");
  if (!Number.isFinite(input.gstRate) || input.gstRate < 0 || input.gstRate > 100) throw new InvoiceEditError("GST rate must be between 0 and 100.");

  const ids = input.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) throw new InvoiceEditError("Combine duplicate products into one line.");

  const lines = input.items.map((item) => {
    if (!item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0) throw new InvoiceEditError("Every line needs a valid product and quantity.");
    let unitPrice = new Prisma.Decimal(item.unitPrice || 0);
    let unitWeight: Prisma.Decimal | null = null;
    let perKgRate: Prisma.Decimal | null = null;
    let totalWeight: Prisma.Decimal | null = null;

    if (item.pricingMode === "WEIGHT") {
      if (!item.unitWeight || item.unitWeight <= 0 || !item.perKgRate || item.perKgRate <= 0) throw new InvoiceEditError("Weight-priced lines need kg/unit and rate/kg.");
      unitWeight = new Prisma.Decimal(item.unitWeight);
      perKgRate = new Prisma.Decimal(item.perKgRate);
      unitPrice = unitWeight.mul(perKgRate);
      totalWeight = unitWeight.mul(item.quantity);
    } else if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
      throw new InvoiceEditError("Unit price must be greater than zero.");
    }

    const discountPerUnit = new Prisma.Decimal(item.discountPerUnit || 0);
    if (discountPerUnit.isNegative() || discountPerUnit.greaterThan(unitPrice)) throw new InvoiceEditError("Discount per unit cannot exceed unit price.");
    const quantity = new Prisma.Decimal(item.quantity);
    const total = unitPrice.minus(discountPerUnit).mul(quantity);
    return { ...item, quantity, unitPrice, discountPerUnit, unitWeight, perKgRate, totalWeight, total };
  });

  const subtotal = lines.reduce((sum, line) => sum.plus(line.unitPrice.mul(line.quantity)), new Prisma.Decimal(0));
  const lineDiscount = lines.reduce((sum, line) => sum.plus(line.discountPerUnit.mul(line.quantity)), new Prisma.Decimal(0));
  const orderDiscount = new Prisma.Decimal(input.orderDiscount);
  const discount = lineDiscount.plus(orderDiscount);
  if (discount.greaterThan(subtotal)) throw new InvoiceEditError("Discount exceeds the invoice subtotal.");
  const taxableAmount = subtotal.minus(discount);
  const gstAmount = taxableAmount.mul(new Prisma.Decimal(input.gstRate).div(100)).toDecimalPlaces(2);
  const total = taxableAmount.plus(gstAmount);
  if (total.isNegative()) throw new InvoiceEditError("Invoice total is invalid.");

  return { lines, subtotal, discount, taxableAmount, gstAmount, total };
}

export async function getInvoiceFinancialLockReason(workspaceId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: {
      payments: { where: { isReversed: false, reversalOfId: null }, select: { id: true }, take: 1 },
      allocations: { where: { payment: { isReversed: false, reversalOfId: null } }, select: { id: true }, take: 1 },
      creditAllocations: { select: { id: true }, take: 1 },
      salesOrder: { include: { returns: { where: { creditNote: { is: { status: { not: "CANCELLED" } } } }, select: { id: true }, take: 1 } } },
    },
  });
  if (!invoice) return "Invoice not found.";
  if (invoice.status === "CANCELLED") return "Cancelled invoices cannot be edited.";
  if (!invoice.salesOrder) return "This invoice is not linked to an editable sale.";
  if (invoice.payments.length || invoice.allocations.length || !invoice.paidAmount.isZero()) return "Reverse or unallocate payments before changing invoice financial lines.";
  if (!invoice.creditApplied.isZero() || invoice.creditAllocations.length) return "Remove applied customer credit before changing invoice financial lines.";
  if (invoice.salesOrder.returns.length) return "Cancel active customer returns before changing invoice financial lines.";
  return null;
}

export async function updateInvoiceFinancials(
  context: { workspaceId: string; userId?: string },
  invoiceId: string,
  input: InvoiceFinancialEditInput,
) {
  const priced = validateAndPrice(input);

  return withSerializableRetry(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, workspaceId: context.workspaceId },
      include: {
        payments: { where: { isReversed: false, reversalOfId: null }, select: { id: true }, take: 1 },
        allocations: { where: { payment: { isReversed: false, reversalOfId: null } }, select: { id: true }, take: 1 },
        creditAllocations: { select: { id: true }, take: 1 },
        salesOrder: {
          include: {
            items: true,
            returns: { where: { creditNote: { is: { status: { not: "CANCELLED" } } } }, select: { id: true }, take: 1 },
          },
        },
      },
    });
    if (!invoice || !invoice.salesOrder) throw new InvoiceEditError("Invoice is not linked to an editable sale.");
    if (invoice.status === "CANCELLED") throw new InvoiceEditError("Cancelled invoices cannot be edited.");
    if (invoice.payments.length || invoice.allocations.length || !invoice.paidAmount.isZero()) throw new InvoiceEditError("Reverse or unallocate payments before changing invoice financial lines.");
    if (!invoice.creditApplied.isZero() || invoice.creditAllocations.length) throw new InvoiceEditError("Remove applied customer credit before changing invoice financial lines.");
    if (invoice.salesOrder.returns.length) throw new InvoiceEditError("Cancel active customer returns before changing invoice financial lines.");

    const order = invoice.salesOrder;
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, workspaceId: context.workspaceId, status: "ACTIVE" },
      select: { id: true, currentBalance: true, creditLimit: true },
    });
    if (!customer) throw new InvoiceEditError("Customer is unavailable.");

    const productIds = priced.lines.map((line) => line.productId);
    const products = await tx.product.findMany({
      where: { workspaceId: context.workspaceId, id: { in: productIds }, status: "ACTIVE" },
      select: { id: true, name: true, sku: true, stockQuantity: true, costPrice: true },
    });
    if (products.length !== productIds.length) throw new InvoiceEditError("One or more products are unavailable.");

    const oldQtyByProduct = new Map<string, Prisma.Decimal>();
    for (const item of order.items) oldQtyByProduct.set(item.productId, (oldQtyByProduct.get(item.productId) ?? new Prisma.Decimal(0)).plus(item.quantity));
    for (const line of priced.lines) {
      const product = products.find((entry) => entry.id === line.productId)!;
      const availableAfterRestore = product.stockQuantity.plus(oldQtyByProduct.get(line.productId) ?? 0);
      if (availableAfterRestore.lessThan(line.quantity)) throw new InvoiceEditError(`${product.name} does not have enough stock for this edit. Available after restoring the old sale: ${availableAfterRestore.toString()}.`);
    }

    const effectiveCustomerBalance = customer.currentBalance.minus(customer.id === order.customerId ? order.total : 0);
    if (customer.creditLimit.greaterThan(0) && effectiveCustomerBalance.plus(priced.total).greaterThan(customer.creditLimit)) {
      throw new InvoiceEditError("The edited invoice would exceed the customer's credit limit.");
    }

    const previousSaleCosts = await tx.inventoryTransaction.findMany({
      where: { workspaceId: context.workspaceId, reference: order.orderNumber, type: "SALE", productId: { in: order.items.map((item) => item.productId) } },
      orderBy: { createdAt: "desc" },
      select: { productId: true, unitCost: true },
    });
    const latestCostByProduct = new Map<string, Prisma.Decimal>();
    for (const row of previousSaleCosts) if (!latestCostByProduct.has(row.productId) && row.unitCost) latestCostByProduct.set(row.productId, row.unitCost);

    for (const item of order.items) {
      const current = await tx.product.findFirstOrThrow({ where: { id: item.productId, workspaceId: context.workspaceId }, select: { stockQuantity: true, costPrice: true } });
      const historicalCost = latestCostByProduct.get(item.productId) ?? current.costPrice;
      const resultingQuantity = current.stockQuantity.plus(item.quantity);
      const resultingCost = resultingQuantity.isZero() ? current.costPrice : current.costPrice.mul(current.stockQuantity).plus(historicalCost.mul(item.quantity)).div(resultingQuantity);
      const changed = await tx.product.updateMany({
        where: { id: item.productId, workspaceId: context.workspaceId, stockQuantity: current.stockQuantity },
        data: { stockQuantity: { increment: item.quantity }, costPrice: resultingCost },
      });
      if (changed.count !== 1) throw new InvoiceEditError("Inventory changed while editing the invoice. Retry the edit.");
      await tx.inventoryTransaction.create({
        data: { workspaceId: context.workspaceId, productId: item.productId, type: "SALE_CANCELLATION", quantityChanged: item.quantity, unitCost: historicalCost, reference: `EDIT-${order.orderNumber}` },
      });
    }

    let costOfGoodsSold = new Prisma.Decimal(0);
    const refreshedProducts = await tx.product.findMany({ where: { workspaceId: context.workspaceId, id: { in: productIds } }, select: { id: true, name: true, sku: true, stockQuantity: true, costPrice: true } });
    for (const line of priced.lines) {
      const product = refreshedProducts.find((entry) => entry.id === line.productId)!;
      if (product.stockQuantity.lessThan(line.quantity)) throw new InvoiceEditError(`${product.name} does not have enough stock for this edit.`);
      const changed = await tx.product.updateMany({
        where: { id: product.id, workspaceId: context.workspaceId, stockQuantity: product.stockQuantity },
        data: { stockQuantity: { decrement: line.quantity } },
      });
      if (changed.count !== 1) throw new InvoiceEditError("Inventory changed while editing the invoice. Retry the edit.");
      costOfGoodsSold = costOfGoodsSold.plus(product.costPrice.mul(line.quantity));
      await tx.inventoryTransaction.create({
        data: { workspaceId: context.workspaceId, productId: product.id, type: "SALE", quantityChanged: line.quantity.negated(), unitCost: product.costPrice, reference: order.orderNumber },
      });
    }

    await reverseGeneralLedgerEntries(tx, {
      workspaceId: context.workspaceId,
      sources: [{ sourceType: "SALE", sourceId: order.id }],
      documentNo: `REV-${order.orderNumber}`,
      date: new Date(),
      reason: `Edited sale ${order.orderNumber}`,
      reversedById: context.userId,
    });

    await tx.ledgerEntry.create({
      data: { workspaceId: context.workspaceId, customerId: order.customerId, type: "REVERSAL", credit: order.total, description: `Edited sale reversal ${order.orderNumber}`, referenceId: order.id },
    });
    await tx.customer.update({ where: { id: order.customerId, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: order.total } } });

    await tx.salesOrderItem.deleteMany({ where: { salesOrderId: order.id } });
    const productById = new Map(refreshedProducts.map((product) => [product.id, product]));
    await tx.salesOrderItem.createMany({
      data: priced.lines.map((line) => {
        const product = productById.get(line.productId)!;
        return {
          salesOrderId: order.id,
          productId: line.productId,
          productName: product.name,
          productSku: product.sku,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPerUnit: line.discountPerUnit,
          totalPrice: line.total,
          pricingMode: line.pricingMode,
          unitWeight: line.pricingMode === "WEIGHT" ? line.unitWeight : null,
          totalWeight: line.pricingMode === "WEIGHT" ? line.totalWeight : null,
          perKgRate: line.pricingMode === "WEIGHT" ? line.perKgRate : null,
        };
      }),
    });

    await tx.salesOrder.update({
      where: { id: order.id, workspaceId: context.workspaceId },
      data: {
        customerId: customer.id,
        subtotal: priced.subtotal,
        discount: priced.discount,
        total: priced.total,
        paidAmount: 0,
        balanceAmount: priced.total,
        notes: input.notes || null,
      },
    });
    await tx.invoice.update({
      where: { id: invoice.id, workspaceId: context.workspaceId },
      data: { customerId: customer.id, amount: priced.total, paidAmount: 0, creditApplied: 0, status: "UNPAID" },
    });

    await tx.ledgerEntry.create({
      data: { workspaceId: context.workspaceId, customerId: customer.id, type: "SALE", debit: priced.total, description: `Edited sale ${order.orderNumber}`, referenceId: order.id },
    });
    await tx.customer.update({ where: { id: customer.id, workspaceId: context.workspaceId }, data: { currentBalance: { increment: priced.total } } });

    await postSaleToGeneralLedger(tx, {
      workspaceId: context.workspaceId,
      saleId: order.id,
      orderNumber: order.orderNumber,
      date: order.orderDate,
      revenue: priced.total,
      costOfGoodsSold,
      cashReceived: new Prisma.Decimal(0),
      cashBankAccountId: null,
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "invoice.financials_updated",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        orderNumber: order.orderNumber,
        previousTotal: order.total.toString(),
        newTotal: priced.total.toString(),
        customerId: customer.id,
      } as Prisma.InputJsonValue,
    });

    return { id: invoice.id, total: priced.total.toNumber() };
  });
}
