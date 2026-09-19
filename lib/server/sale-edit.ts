import "server-only";

import { Prisma, type Role } from "@prisma/client";

import { postSaleToGeneralLedger } from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { allocateUniformSalesTax } from "@/lib/sales-tax";
import { applyManagedWarehouseStockDelta, ManagedWarehouseStockError } from "@/lib/server/managed-warehouse-stock";
import { saleEditSchema, type SaleEditInput } from "@/lib/validation/sale-edit";

export class SaleEditDomainError extends Error {}

type EditContext = { workspaceId: string; role: Role; userId?: string };

export async function updateSaleAndInvoice(context: EditContext, input: SaleEditInput) {
  if (!(["OWNER", "ADMIN", "MANAGER"] as Role[]).includes(context.role)) {
    throw new SaleEditDomainError("You do not have permission to edit posted invoices.");
  }
  const data = saleEditSchema.parse(input);

  return withSerializableRetry(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: data.saleId, workspaceId: context.workspaceId },
      include: {
        items: true,
        returns: { where: { creditNote: { is: { status: { not: "CANCELLED" } } } }, select: { id: true }, take: 1 },
        invoices: {
          include: {
            payments: { where: { isReversed: false }, select: { id: true }, take: 1 },
            allocations: { where: { payment: { isReversed: false } }, select: { id: true }, take: 1 },
            creditAllocations: { select: { id: true }, take: 1 },
          },
        },
      },
    });
    if (!order) throw new SaleEditDomainError("Sale not found.");
    if (order.status === "CANCELLED") throw new SaleEditDomainError("Cancelled invoices cannot be edited.");

    const invoice = order.invoices[0];
    if (!invoice) throw new SaleEditDomainError("The linked invoice could not be found.");
    if (order.returns.length) throw new SaleEditDomainError("Reverse or cancel customer returns before editing this invoice.");
    if (!order.paidAmount.isZero() || !invoice.paidAmount.isZero() || !invoice.creditApplied.isZero() || invoice.payments.length || invoice.allocations.length || invoice.creditAllocations.length) {
      throw new SaleEditDomainError("This invoice has payment or credit activity. Reverse/unallocate it before changing financial line items.");
    }

    const newCustomer = await tx.customer.findFirst({
      where: { id: data.customerId, workspaceId: context.workspaceId, status: "ACTIVE" },
      select: { id: true, currentBalance: true, creditLimit: true },
    });
    if (!newCustomer) throw new SaleEditDomainError("The selected customer is unavailable.");

    const requestedProductIds = data.items.map((item) => item.productId);
    const productCount = await tx.product.count({ where: { workspaceId: context.workspaceId, id: { in: requestedProductIds }, status: "ACTIVE" } });
    if (productCount !== requestedProductIds.length) throw new SaleEditDomainError("One or more selected products are unavailable.");

    const oldSaleTransactions = await tx.inventoryTransaction.findMany({
      where: { workspaceId: context.workspaceId, reference: order.orderNumber, type: "SALE" },
      select: { productId: true, unitCost: true },
    });

    // Restore the original inventory first, including its historical cost basis.
    for (const item of order.items) {
      const historicalCost = oldSaleTransactions.find((entry) => entry.productId === item.productId)?.unitCost ?? new Prisma.Decimal(0);
      const product = await tx.product.findFirstOrThrow({
        where: { id: item.productId, workspaceId: context.workspaceId },
        select: { stockQuantity: true, costPrice: true },
      });
      const resultingQuantity = product.stockQuantity.plus(item.quantity);
      const resultingCost = resultingQuantity.isZero()
        ? product.costPrice
        : product.costPrice.mul(product.stockQuantity).plus(historicalCost.mul(item.quantity)).div(resultingQuantity);
      const changed = await tx.product.updateMany({
        where: { id: item.productId, workspaceId: context.workspaceId, stockQuantity: product.stockQuantity },
        data: { stockQuantity: { increment: item.quantity }, costPrice: resultingCost },
      });
      if (changed.count !== 1) throw new SaleEditDomainError("Inventory changed while editing. Refresh and try again.");
      try {
        await applyManagedWarehouseStockDelta(tx, {
          workspaceId: context.workspaceId,
          warehouseId: order.warehouseId,
          productId: item.productId,
          delta: item.quantity,
        });
      } catch (error) {
        if (error instanceof ManagedWarehouseStockError) {
          throw new SaleEditDomainError(`Warehouse inventory could not be restored safely: ${error.message}`);
        }
        throw error;
      }
    }

    await tx.inventoryTransaction.deleteMany({
      where: { workspaceId: context.workspaceId, reference: order.orderNumber, type: "SALE" },
    });

    const freshProducts = await tx.product.findMany({
      where: { workspaceId: context.workspaceId, id: { in: requestedProductIds }, status: "ACTIVE" },
      select: {
      id: true,
      name: true,
      sku: true,
      stockQuantity: true,
      costPrice: true,
      fbrHsCode: true,
      fbrUom: true,
      fbrUomId: true,
      fbrTransactionTypeId: true,
      fbrTransactionTypeDesc: true,
      fbrRateId: true,
      fbrRateDesc: true,
      fbrRateValue: true,
      fbrReferenceVerifiedAt: true,
      fbrReferenceVerifiedForDate: true,
      fbrReferenceProvinceCode: true,
      fbrReferenceProvinceDesc: true,
    },
    });

    const lines = data.items.map((item) => {
      const product = freshProducts.find((entry) => entry.id === item.productId);
      if (!product) throw new SaleEditDomainError("One or more selected products are unavailable.");
      const unitPrice = item.pricingMode === "WEIGHT"
        ? new Prisma.Decimal(item.unitWeight!).mul(item.perKgRate!)
        : new Prisma.Decimal(item.unitPrice);
      const quantity = new Prisma.Decimal(item.quantity);
      if (product.stockQuantity.lessThan(quantity)) {
        throw new SaleEditDomainError(`${product.name} has only ${product.stockQuantity.toString()} available after restoring the original sale.`);
      }
      const discountPerUnit = new Prisma.Decimal(item.discountPerUnit);
      const totalWeight = item.pricingMode === "WEIGHT" ? new Prisma.Decimal(item.unitWeight!).mul(quantity) : null;
      return { item, product, quantity, unitPrice, discountPerUnit, totalWeight, total: unitPrice.minus(discountPerUnit).mul(quantity) };
    });

    const subtotal = lines.reduce((sum, line) => sum.plus(line.unitPrice.mul(line.quantity)), new Prisma.Decimal(0));
    const lineDiscount = lines.reduce((sum, line) => sum.plus(line.discountPerUnit.mul(line.quantity)), new Prisma.Decimal(0));
    const orderDiscount = new Prisma.Decimal(data.orderDiscount);
    const discount = lineDiscount.plus(orderDiscount);
    let taxAllocation;
    try {
      taxAllocation = allocateUniformSalesTax(
        lines.map((line) => line.total),
        orderDiscount,
        new Prisma.Decimal(data.gstRate),
      );
    } catch (error) {
      throw new SaleEditDomainError(error instanceof Error ? error.message : "Sales tax allocation failed.");
    }
    const taxableAmount = taxAllocation.totalTaxable;
    const gstAmount = taxAllocation.totalTax;
    const total = taxableAmount.plus(gstAmount);

    const projectedCustomerBalance = newCustomer.currentBalance
      .minus(order.customerId === newCustomer.id ? order.total : new Prisma.Decimal(0))
      .plus(total);
    if (newCustomer.creditLimit.greaterThan(0) && projectedCustomerBalance.greaterThan(newCustomer.creditLimit)) {
      throw new SaleEditDomainError("The edited invoice would exceed the customer's credit limit.");
    }

    let costOfGoodsSold = new Prisma.Decimal(0);
    for (const line of lines) {
      costOfGoodsSold = costOfGoodsSold.plus(line.product.costPrice.mul(line.quantity));
      const changed = await tx.product.updateMany({
        where: { id: line.product.id, workspaceId: context.workspaceId, stockQuantity: { gte: line.quantity } },
        data: { stockQuantity: { decrement: line.quantity } },
      });
      if (changed.count !== 1) throw new SaleEditDomainError(`Inventory changed for ${line.product.name}. Refresh and try again.`);
      try {
        await applyManagedWarehouseStockDelta(tx, {
          workspaceId: context.workspaceId,
          warehouseId: order.warehouseId,
          productId: line.product.id,
          delta: line.quantity.negated(),
        });
      } catch (error) {
        if (error instanceof ManagedWarehouseStockError) {
          if (error.code === "NEGATIVE_WAREHOUSE_STOCK") {
            throw new SaleEditDomainError(`${line.product.name} does not have sufficient stock in the sale warehouse.`);
          }
          throw new SaleEditDomainError(`Warehouse inventory could not be updated safely: ${error.message}`);
        }
        throw error;
      }
      await tx.inventoryTransaction.create({
        data: {
          workspaceId: context.workspaceId,
          productId: line.product.id,
          type: "SALE",
          quantityChanged: line.quantity.negated(),
          unitCost: line.product.costPrice,
          reference: order.orderNumber,
        },
      });
    }

    await tx.salesOrderItem.deleteMany({ where: { salesOrderId: order.id } });
    await tx.salesOrderItem.createMany({
      data: lines.map((line, index) => ({
        salesOrderId: order.id,
        productId: line.product.id,
        productName: line.product.name,
        productSku: line.product.sku,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPerUnit: line.discountPerUnit,
        totalPrice: line.total,
        taxRate: taxAllocation.lines[index]!.taxRate,
        taxableAmount: taxAllocation.lines[index]!.taxableAmount,
        salesTaxAmount: taxAllocation.lines[index]!.salesTaxAmount,
        fbrHsCode: line.product.fbrHsCode,
        fbrUom: line.product.fbrUom,
        fbrUomId: line.product.fbrUomId,
        fbrTransactionTypeId: line.product.fbrTransactionTypeId,
        fbrSaleType: line.product.fbrTransactionTypeDesc,
        fbrRateId: line.product.fbrRateId,
        fbrRateDesc: line.product.fbrRateDesc,
        fbrRateValue: line.product.fbrRateValue,
        fbrReferenceVerifiedAt: line.product.fbrReferenceVerifiedAt,
        fbrReferenceVerifiedForDate: line.product.fbrReferenceVerifiedForDate,
        fbrReferenceProvinceCode: line.product.fbrReferenceProvinceCode,
        fbrReferenceProvinceDesc: line.product.fbrReferenceProvinceDesc,
        pricingMode: line.item.pricingMode,
        unitWeight: line.item.pricingMode === "WEIGHT" ? line.item.unitWeight : null,
        totalWeight: line.totalWeight,
        perKgRate: line.item.pricingMode === "WEIGHT" ? line.item.perKgRate : null,
      })),
    });

    const oldTotal = order.total;
    if (order.customerId === newCustomer.id) {
      const delta = total.minus(oldTotal);
      if (!delta.isZero()) {
        await tx.customer.update({ where: { id: newCustomer.id, workspaceId: context.workspaceId }, data: { currentBalance: { increment: delta } } });
      }
    } else {
      await tx.customer.update({ where: { id: order.customerId, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: oldTotal } } });
      await tx.customer.update({ where: { id: newCustomer.id, workspaceId: context.workspaceId }, data: { currentBalance: { increment: total } } });
    }

    await tx.salesOrder.update({
      where: { id: order.id, workspaceId: context.workspaceId },
      data: {
        customerId: newCustomer.id,
        subtotal,
        discount,
        total,
        paidAmount: 0,
        balanceAmount: total,
        notes: data.notes || null,
        orderDate: data.issuedAt,
      },
    });
    await tx.invoice.update({
      where: { id: invoice.id, workspaceId: context.workspaceId },
      data: {
        customerId: newCustomer.id,
        amount: total,
        paidAmount: 0,
        status: "UNPAID",
        issuedAt: data.issuedAt,
        dueDate: data.dueDate,
      },
    });

    const ledgerUpdated = await tx.ledgerEntry.updateMany({
      where: { workspaceId: context.workspaceId, referenceId: order.id, type: "SALE" },
      data: { customerId: newCustomer.id, debit: total, credit: 0, date: data.issuedAt, description: `Sale ${order.orderNumber}` },
    });
    if (!ledgerUpdated.count) {
      await tx.ledgerEntry.create({
        data: { workspaceId: context.workspaceId, customerId: newCustomer.id, type: "SALE", debit: total, description: `Sale ${order.orderNumber}`, referenceId: order.id, date: data.issuedAt },
      });
    }

    const originalGl = await tx.generalLedgerEntry.findMany({
      where: { workspaceId: context.workspaceId, sourceType: "SALE", sourceId: order.id, reversalOfId: null },
      select: { id: true },
    });
    const reversedGlCount = originalGl.length
      ? await tx.generalLedgerEntry.count({ where: { workspaceId: context.workspaceId, reversalOfId: { in: originalGl.map((entry) => entry.id) } } })
      : 0;
    if (reversedGlCount) throw new SaleEditDomainError("This invoice already has accounting reversals and cannot be edited in place.");
    if (originalGl.length) {
      await tx.generalLedgerEntry.deleteMany({ where: { workspaceId: context.workspaceId, id: { in: originalGl.map((entry) => entry.id) } } });
    }
    await postSaleToGeneralLedger(tx, {
      workspaceId: context.workspaceId,
      saleId: order.id,
      orderNumber: order.orderNumber,
      date: data.issuedAt,
      revenue: taxableAmount,
      salesTax: gstAmount,
      costOfGoodsSold,
      cashReceived: new Prisma.Decimal(0),
    });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "sale.edited",
      entityType: "SalesOrder",
      entityId: order.id,
      metadata: { invoiceId: invoice.id, oldTotal: oldTotal.toString(), newTotal: total.toString(), customerId: newCustomer.id },
    });

    return { saleId: order.id, invoiceId: invoice.id };
  });
}
