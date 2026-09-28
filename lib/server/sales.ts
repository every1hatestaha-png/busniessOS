import "server-only";

import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import { postCustomerReturnToGeneralLedger, postSaleToGeneralLedger, reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { allocateSalesTaxByLine } from "@/lib/sales-tax";
import { saleSchema, type SaleInput } from "@/lib/validation/sale";
import { writeAudit } from "@/lib/server/audit";
import { customerReturnSchema, type CustomerReturnInput } from "@/lib/validation/returns";
import { canPerformAction } from "@/lib/server/authorization";
import { formatPKR } from "@/lib/utils";
import { applyManagedWarehouseStockDelta, assertManagedWarehouseSelection, getWarehouseStockModeInTransaction, ManagedWarehouseStockError } from "@/lib/server/managed-warehouse-stock";
import {
  consumeCustomerSalesBomComponents,
  CustomerSalesBomError,
  restoreReturnedBomComponents,
  restoreSaleBomComponents,
} from "@/lib/server/customer-sales-bom";
import type { InvoiceIssuedSnapshot } from "@/lib/server/invoice-snapshot";

export type ServiceContext = { workspaceId: string; role: Role; userId?: string };
export class SaleDomainError extends Error {
  constructor(public code: "CUSTOMER_NOT_FOUND" | "PRODUCT_NOT_FOUND" | "INSUFFICIENT_STOCK" | "INVALID_TOTAL" | "CREDIT_LIMIT_EXCEEDED" | "PAYMENT_PERMISSION_DENIED" | "PAYMENT_ACCOUNT_UNAVAILABLE" | "SALE_NOT_FOUND" | "INVALID_RETURN" | "PERMISSION_DENIED" | "WAREHOUSE_REQUIRED" | "WAREHOUSE_NOT_FOUND" | "WAREHOUSE_STOCK_ERROR" | "IDEMPOTENCY_CONFLICT", message: string) {
    super(message);
  }
}

function throwBomAsSaleError(error: unknown): never {
  if (error instanceof CustomerSalesBomError) {
    if (error.code === "INSUFFICIENT_STOCK") throw new SaleDomainError("INSUFFICIENT_STOCK", error.message);
    if (error.code === "WAREHOUSE_STOCK_ERROR") throw new SaleDomainError("WAREHOUSE_STOCK_ERROR", error.message);
    if (error.code === "NOT_FOUND") throw new SaleDomainError("PRODUCT_NOT_FOUND", error.message);
    if (error.code === "PERMISSION_DENIED") throw new SaleDomainError("PERMISSION_DENIED", error.message);
    throw new SaleDomainError("INVALID_TOTAL", error.message);
  }
  throw error;
}

export async function createSale(context: ServiceContext, input: SaleInput) {
  if (!canPerformAction(context.role, "sales.create")) throw new SaleDomainError("PERMISSION_DENIED", "Unauthorized");
  const data = saleSchema.parse(input);
  return withSerializableRetry(async (tx) => {
    const existing = await tx.salesOrder.findFirst({
      where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey },
      select: {
        id: true,
        customerId: true,
        warehouseId: true,
        discount: true,
        paidAmount: true,
        notes: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            unitPrice: true,
            discountPerUnit: true,
            taxRate: true,
            pricingMode: true,
            unitWeight: true,
            perKgRate: true,
          },
        },
        invoices: {
          select: {
            payments: {
              where: { isReversed: false, reversalOfId: null },
              select: { cashBankAccountId: true, amount: true },
              take: 1,
            },
          },
          take: 1,
        },
      },
    });
    if (existing) {
      const itemByProduct = new Map(existing.items.map((item) => [item.productId, item]));
      const expectedLineDiscount = data.items.reduce(
        (sum, item) => sum.plus(new Prisma.Decimal(item.discountPerUnit).mul(item.quantity)),
        new Prisma.Decimal(0),
      );
      const existingOrderDiscount = existing.discount.minus(expectedLineDiscount);
      const recordedPayment = existing.invoices[0]?.payments[0] ?? null;
      const sameItems = existing.items.length === data.items.length && data.items.every((requested) => {
        const stored = itemByProduct.get(requested.productId);
        if (!stored) return false;
        const requestedUnitPrice = requested.pricingMode === "WEIGHT"
          ? new Prisma.Decimal(requested.unitWeight!).mul(requested.perKgRate!)
          : new Prisma.Decimal(requested.unitPrice);
        const requestedTaxRate = new Prisma.Decimal(requested.taxRate ?? data.gstRate);
        return stored.quantity.equals(requested.quantity)
          && stored.unitPrice.equals(requestedUnitPrice)
          && stored.discountPerUnit.equals(requested.discountPerUnit)
          && new Prisma.Decimal(stored.taxRate ?? 0).equals(requestedTaxRate)
          && stored.pricingMode === requested.pricingMode
          && (
            requested.pricingMode !== "WEIGHT"
            || (
              new Prisma.Decimal(stored.unitWeight ?? 0).equals(requested.unitWeight!)
              && new Prisma.Decimal(stored.perKgRate ?? 0).equals(requested.perKgRate!)
            )
          );
      });
      const sameCore = existing.customerId === data.customerId
        && (existing.warehouseId ?? "") === (data.warehouseId ?? "")
        && existingOrderDiscount.equals(data.orderDiscount)
        && existing.paidAmount.equals(data.paidAmount)
        && (existing.notes ?? "") === data.notes
        && (
          data.paidAmount === 0
            ? !recordedPayment
            : Boolean(
                recordedPayment
                && recordedPayment.amount.equals(data.paidAmount)
                && (recordedPayment.cashBankAccountId ?? "") === (data.cashBankAccountId ?? ""),
              )
        );
      if (!sameCore || !sameItems) {
        throw new SaleDomainError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different sale request.");
      }
      return { id: existing.id };
    }
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, workspaceId: context.workspaceId, status: "ACTIVE" }, select: { id: true, name: true, companyName: true, phone: true, address: true, city: true, taxId: true, province: true, registrationType: true, currentBalance: true, creditLimit: true, creditDays: true } });
    if (!customer) throw new SaleDomainError("CUSTOMER_NOT_FOUND", "Customer is unavailable.");

    const warehouseMode = await getWarehouseStockModeInTransaction(tx, context.workspaceId);
    if (warehouseMode === "MANAGED" && !data.warehouseId) {
      throw new SaleDomainError("WAREHOUSE_REQUIRED", "Choose the warehouse issuing this sale.");
    }
    if (warehouseMode === "LEGACY" && data.warehouseId) {
      throw new SaleDomainError("WAREHOUSE_STOCK_ERROR", "Warehouse issuing is not enabled for this workspace yet.");
    }
    if (warehouseMode === "MANAGED") {
      try {
        await assertManagedWarehouseSelection(tx, {
          workspaceId: context.workspaceId,
          warehouseId: data.warehouseId,
        });
      } catch (error) {
        if (error instanceof ManagedWarehouseStockError) {
          if (error.code === "WAREHOUSE_REQUIRED") throw new SaleDomainError("WAREHOUSE_REQUIRED", error.message);
          if (error.code === "WAREHOUSE_NOT_FOUND") throw new SaleDomainError("WAREHOUSE_NOT_FOUND", error.message);
          throw new SaleDomainError("WAREHOUSE_STOCK_ERROR", error.message);
        }
        throw error;
      }
    }
    const products = await tx.product.findMany({ where: { workspaceId: context.workspaceId, id: { in: data.items.map((item) => item.productId) }, status: "ACTIVE" }, select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
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
      fbrHsUomVerifiedAt: true,
      fbrHsUomAnnexureId: true,
    } });
    if (products.length !== data.items.length) throw new SaleDomainError("PRODUCT_NOT_FOUND", "One or more products are unavailable.");

    const lines = data.items.map((item) => {
      const unitPrice = item.pricingMode === "WEIGHT" ? new Prisma.Decimal(item.unitWeight!).mul(item.perKgRate!) : new Prisma.Decimal(item.unitPrice);
      const totalWeight = item.pricingMode === "WEIGHT" ? new Prisma.Decimal(item.unitWeight!).mul(item.quantity) : null;
      const gross = unitPrice.mul(item.quantity);
      const discountPerUnit = new Prisma.Decimal(item.discountPerUnit);
      const discount = discountPerUnit.mul(item.quantity);
      return { ...item, unitPrice, totalWeight, total: gross.minus(discount) };
    });
    const subtotal = lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.unitPrice).mul(line.quantity)), new Prisma.Decimal(0));
    const lineDiscount = lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.discountPerUnit).mul(line.quantity)), new Prisma.Decimal(0));
    const discount = lineDiscount.plus(data.orderDiscount);
    const taxAllocation = allocateSalesTaxByLine(
      lines.map((line) => line.total),
      new Prisma.Decimal(data.orderDiscount),
      lines.map((line) => new Prisma.Decimal(line.taxRate ?? data.gstRate)),
    );
    const taxableAmount = taxAllocation.totalTaxable;
    const gstAmount = taxAllocation.totalTax;
    const total = taxableAmount.plus(gstAmount);
    const paid = new Prisma.Decimal(data.paidAmount);
    if (taxableAmount.isNegative() || paid.greaterThan(total)) throw new SaleDomainError("INVALID_TOTAL", "Payment or discount exceeds the order total.");
    if (paid.greaterThan(0) && !canPerformAction(context.role, "payments.record")) throw new SaleDomainError("PAYMENT_PERMISSION_DENIED", "You do not have permission to record a payment with this sale.");
    const additionalCredit = total.minus(paid);
    if (customer.creditLimit.greaterThan(0)) {
      const remainingCredit = customer.creditLimit.minus(customer.currentBalance);
      const availableCredit = remainingCredit.greaterThan(0) ? remainingCredit : new Prisma.Decimal(0);
      if (additionalCredit.greaterThan(availableCredit)) {
        throw new SaleDomainError("CREDIT_LIMIT_EXCEEDED", `Customer credit limit exceeded. Available credit: ${formatPKR(availableCredit.toNumber())}.`);
      }
    }

    const cashBankAccountId = data.cashBankAccountId || null;
    let receiptMethod: "CASH" | "BANK_TRANSFER" = "CASH";
    if (paid.greaterThan(0)) {
      const cashBankAccount = await tx.cashBankAccount.findFirst({ where: { id: cashBankAccountId!, workspaceId: context.workspaceId, isActive: true }, select: { id: true, isBank: true } });
      if (!cashBankAccount) throw new SaleDomainError("PAYMENT_ACCOUNT_UNAVAILABLE", "The selected cash/bank account is unavailable.");
      receiptMethod = cashBankAccount.isBank ? "BANK_TRANSFER" : "CASH";
    }

    for (const line of lines) {
      const product = products.find((entry) => entry.id === line.productId)!;
      if (product.stockQuantity.lessThan(line.quantity)) {
        throw new SaleDomainError("INSUFFICIENT_STOCK", `Unable to create sale because ${product.name} does not have sufficient inventory. Available quantity: ${product.stockQuantity.toString()}.`);
      }
    }

    const orderNumber = await nextDocumentNumber(tx, context.workspaceId, "SALES_ORDER");
    const invoiceNumber = await nextDocumentNumber(tx, context.workspaceId, "INVOICE");
    const order = await tx.salesOrder.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, orderNumber, status: "CONFIRMED", subtotal, discount, total, paidAmount: paid, balanceAmount: total.minus(paid), notes: data.notes || null, idempotencyKey: data.idempotencyKey, warehouseId: warehouseMode === "MANAGED" ? data.warehouseId! : null }, select: { id: true, orderDate: true, warehouseId: true } });
    let costOfGoodsSold = new Prisma.Decimal(0);
    const productById = new Map(products.map((product) => [product.id, product]));

    for (const line of lines) {
      const product = productById.get(line.productId)!;
      costOfGoodsSold = costOfGoodsSold.plus(product.costPrice.mul(line.quantity));
      const changed = await tx.product.updateMany({ where: { id: line.productId, workspaceId: context.workspaceId, stockQuantity: { gte: line.quantity } }, data: { stockQuantity: { decrement: line.quantity } } });
      if (changed.count !== 1) throw new SaleDomainError("INSUFFICIENT_STOCK", `Unable to create sale because ${product.name} does not have sufficient inventory. Available quantity: ${product.stockQuantity.toString()}.`);
      try {
        await applyManagedWarehouseStockDelta(tx, {
          workspaceId: context.workspaceId,
          warehouseId: data.warehouseId,
          productId: line.productId,
          delta: new Prisma.Decimal(line.quantity).negated(),
        });
      } catch (error) {
        if (error instanceof ManagedWarehouseStockError) {
          if (error.code === "NEGATIVE_WAREHOUSE_STOCK") {
            throw new SaleDomainError("INSUFFICIENT_STOCK", `${product.name} does not have sufficient stock in the selected warehouse.`);
          }
          throw new SaleDomainError("WAREHOUSE_STOCK_ERROR", error.message);
        }
        throw error;
      }
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: line.productId, type: "SALE", quantity: new Prisma.Decimal(line.quantity).negated(), referenceId: order.id, notes: `Sale ${orderNumber}${order.warehouseId ? ` from warehouse ${order.warehouseId}` : ""}` } });
    }

    const createdItems = await Promise.all(lines.map((line, index) => tx.salesOrderItem.create({ data: { salesOrderId: order.id, productId: line.productId, productName: productById.get(line.productId)!.name, productSku: productById.get(line.productId)!.sku, quantity: line.quantity, unitPrice: line.unitPrice, discountPerUnit: line.discountPerUnit, total: line.total, linePosition: index + 1, pricingMode: line.pricingMode, unitWeight: line.unitWeight ?? null, totalWeight: line.totalWeight, perKgRate: line.perKgRate ?? null, taxRate: taxAllocation.lines[index]!.rate, taxableAmount: taxAllocation.lines[index]!.taxable, taxAmount: taxAllocation.lines[index]!.tax } }))); 

    const bomResult = await consumeCustomerSalesBomComponents(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      saleId: order.id,
      saleNumber: orderNumber,
      warehouseId: order.warehouseId,
      saleItems: createdItems.map((item) => ({ saleItemId: item.id, productId: item.productId, quantity: item.quantity })),
    }).catch(throwBomAsSaleError);
    costOfGoodsSold = costOfGoodsSold.plus(bomResult.additionalCostOfGoodsSold);

    const invoiceDueDate = new Date(order.orderDate);
    invoiceDueDate.setUTCDate(invoiceDueDate.getUTCDate() + Math.max(0, customer.creditDays));
    const customerSnapshot = {
      name: customer.name,
      companyName: customer.companyName,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      taxId: customer.taxId,
      province: customer.province,
      registrationType: customer.registrationType,
    } satisfies InvoiceIssuedSnapshot["customer"];
    const issuedItems = createdItems.map((item) => ({
      name: productById.get(item.productId)!.name,
      sku: productById.get(item.productId)!.sku,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      discountPerUnit: item.discountPerUnit.toString(),
      total: item.total.toString(),
      pricingMode: item.pricingMode,
      unitWeight: item.unitWeight?.toString() ?? null,
      totalWeight: item.totalWeight?.toString() ?? null,
      perKgRate: item.perKgRate?.toString() ?? null,
      taxRate: item.taxRate?.toString() ?? "0",
      taxableAmount: item.taxableAmount?.toString() ?? "0",
      taxAmount: item.taxAmount?.toString() ?? "0",
      fbrHsCode: productById.get(item.productId)!.fbrHsCode,
      fbrUom: productById.get(item.productId)!.fbrUom,
      fbrUomId: productById.get(item.productId)!.fbrUomId,
      fbrTransactionTypeId: productById.get(item.productId)!.fbrTransactionTypeId,
      fbrTransactionTypeDesc: productById.get(item.productId)!.fbrTransactionTypeDesc,
      fbrRateId: productById.get(item.productId)!.fbrRateId,
      fbrRateDesc: productById.get(item.productId)!.fbrRateDesc,
      fbrRateValue: productById.get(item.productId)!.fbrRateValue?.toString() ?? null,
      fbrReferenceVerifiedAt: productById.get(item.productId)!.fbrReferenceVerifiedAt?.toISOString() ?? null,
      fbrReferenceVerifiedForDate: productById.get(item.productId)!.fbrReferenceVerifiedForDate?.toISOString() ?? null,
      fbrReferenceProvinceCode: productById.get(item.productId)!.fbrReferenceProvinceCode,
      fbrReferenceProvinceDesc: productById.get(item.productId)!.fbrReferenceProvinceDesc,
      fbrHsUomVerifiedAt: productById.get(item.productId)!.fbrHsUomVerifiedAt?.toISOString() ?? null,
      fbrHsUomAnnexureId: productById.get(item.productId)!.fbrHsUomAnnexureId,
    }));
    await tx.invoice.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, salesOrderId: order.id, invoiceNumber, amount: total, paidAmount: paid, balanceAmount: total.minus(paid), status: paid.equals(total) ? "PAID" : paid.greaterThan(0) ? "PARTIALLY_PAID" : "UNPAID", dueDate: invoiceDueDate, issuedSnapshot: { version: 1, issuedAt: order.orderDate.toISOString(), customer: customerSnapshot, items: issuedItems, totals: { subtotal: subtotal.toString(), discount: discount.toString(), taxable: taxableAmount.toString(), tax: gstAmount.toString(), total: total.toString(), paid: paid.toString(), balance: total.minus(paid).toString() } } } });
    await postSaleToGeneralLedger(tx, { workspaceId: context.workspaceId, saleId: order.id, documentNo: orderNumber, date: order.orderDate, total, costOfGoodsSold, paid, taxAmount: gstAmount, cashBankAccountId });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "sale.created", entityType: "SalesOrder", entityId: order.id, metadata: { orderNumber, total: total.toString(), paid: paid.toString(), warehouseId: order.warehouseId } });
    return { id: order.id };
  });
}

export async function listSales(workspaceId: string) {
  return db.salesOrder.findMany({ where: { workspaceId }, orderBy: { orderDate: "desc" }, include: { customer: true, items: true, invoices: true } });
}

export async function getSale(workspaceId: string, id: string) {
  return db.salesOrder.findFirst({ where: { id, workspaceId }, include: { customer: true, items: { include: { product: true, bomConsumptions: { include: { componentProduct: true } } } }, invoices: true } });
}

export async function cancelSale(context: ServiceContext, saleId: string) {
  if (!canPerformAction(context.role, "sales.cancel")) throw new SaleDomainError("PERMISSION_DENIED", "You do not have permission to cancel sales.");
  return withSerializableRetry(async (tx) => {
    const sale = await tx.salesOrder.findFirst({ where: { id: saleId, workspaceId: context.workspaceId }, include: { customer: true, items: true, invoices: true, customerReturns: { where: { status: "POSTED" }, select: { id: true }, take: 1 } } });
    if (!sale) throw new SaleDomainError("SALE_NOT_FOUND", "Sale not found.");
    if (sale.status === "CANCELLED") return { id: sale.id, status: sale.status };
    if (sale.customerReturns.length) throw new SaleDomainError("INVALID_RETURN", "Cancel customer returns before cancelling this sale.");
    const settledByPaymentOrCredit = sale.invoices.some((invoice) => invoice.paidAmount.greaterThan(0) || invoice.creditApplied.greaterThan(0));
    if (settledByPaymentOrCredit) throw new SaleDomainError("INVALID_RETURN", "Reverse customer payments and credit allocations before cancelling this sale.");

    for (const item of sale.items) {
      const inventory = await tx.product.updateMany({ where: { id: item.productId, workspaceId: context.workspaceId }, data: { stockQuantity: { increment: item.quantity } } });
      if (inventory.count !== 1) throw new SaleDomainError("PRODUCT_NOT_FOUND", "A sale product no longer exists in this workspace.");
      try {
        await applyManagedWarehouseStockDelta(tx, { workspaceId: context.workspaceId, warehouseId: sale.warehouseId, productId: item.productId, delta: item.quantity });
      } catch (error) {
        if (error instanceof ManagedWarehouseStockError) throw new SaleDomainError("WAREHOUSE_STOCK_ERROR", error.message);
        throw error;
      }
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: item.productId, type: "SALE_CANCEL", quantity: item.quantity, referenceId: sale.id, notes: `Cancelled sale ${sale.orderNumber}${sale.warehouseId ? ` in warehouse ${sale.warehouseId}` : ""}` } });
    }
    await restoreSaleBomComponents(tx, { workspaceId: context.workspaceId, actorId: context.userId, saleId: sale.id, warehouseId: sale.warehouseId }).catch(throwBomAsSaleError);

    await tx.invoice.updateMany({ where: { salesOrderId: sale.id, workspaceId: context.workspaceId }, data: { status: "CANCELLED", balanceAmount: 0 } });
    await tx.salesOrder.update({ where: { id: sale.id, workspaceId: context.workspaceId }, data: { status: "CANCELLED", balanceAmount: 0, cancelledAt: new Date(), cancelledById: context.userId } });
    await tx.customer.update({ where: { id: sale.customerId, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: sale.balanceAmount } } });
    await reverseGeneralLedgerEntries(tx, { workspaceId: context.workspaceId, sourceType: "SALE", sourceId: sale.id, documentNo: `${sale.orderNumber}-REV`, date: new Date(), narration: `Reversal of cancelled sale ${sale.orderNumber}` });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "sale.cancelled", entityType: "SalesOrder", entityId: sale.id, metadata: { orderNumber: sale.orderNumber } });
    return { id: sale.id, status: "CANCELLED" as const };
  });
}

export async function createCustomerReturn(context: ServiceContext, input: CustomerReturnInput) {
  if (!canPerformAction(context.role, "returns.create")) throw new SaleDomainError("PERMISSION_DENIED", "You do not have permission to post customer returns.");
  const data = customerReturnSchema.parse(input);
  return withSerializableRetry(async (tx) => {
    const existing = await tx.customerReturn.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true, salesOrderId: true, reason: true, items: { select: { salesOrderItemId: true, quantity: true } } } });
    if (existing) {
      const itemBySaleLine = new Map(existing.items.map((item) => [item.salesOrderItemId, item.quantity]));
      const sameRequest = existing.salesOrderId === data.salesOrderId
        && existing.reason === data.reason
        && existing.items.length === data.items.length
        && data.items.every((item) => itemBySaleLine.get(item.salesOrderItemId)?.equals(item.quantity));
      if (!sameRequest) throw new SaleDomainError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different customer return request.");
      return { id: existing.id };
    }

    const sale = await tx.salesOrder.findFirst({ where: { id: data.salesOrderId, workspaceId: context.workspaceId }, include: { items: true, customer: true } });
    if (!sale) throw new SaleDomainError("SALE_NOT_FOUND", "Sale not found.");
    if (sale.status === "CANCELLED") throw new SaleDomainError("INVALID_RETURN", "Cancelled sales cannot be returned.");
    const returnIds = data.items.map((item) => item.salesOrderItemId);
    if (new Set(returnIds).size !== returnIds.length) throw new SaleDomainError("INVALID_RETURN", "Duplicate sale items are not allowed on a return.");
    const priorReturns = await tx.customerReturnItem.groupBy({ by: ["salesOrderItemId"], where: { salesOrderItemId: { in: returnIds }, customerReturn: { workspaceId: context.workspaceId, status: "POSTED" } }, _sum: { quantity: true } });
    const priorByItem = new Map(priorReturns.map((row) => [row.salesOrderItemId, row._sum.quantity ?? new Prisma.Decimal(0)]));

    const requestedLines = data.items.map((item) => {
      const saleItem = sale.items.find((entry) => entry.id === item.salesOrderItemId);
      if (!saleItem) throw new SaleDomainError("INVALID_RETURN", "Return line does not belong to the sale.");
      const previousReturned = priorByItem.get(item.salesOrderItemId) ?? new Prisma.Decimal(0);
      const remainingQuantity = saleItem.quantity.minus(previousReturned);
      if (new Prisma.Decimal(item.quantity).gt(remainingQuantity)) throw new SaleDomainError("INVALID_RETURN", "Return quantity exceeds the remaining sold quantity.");
      return { request: item, saleItem, previousReturned, remainingQuantity };
    });

    const priorCreditTotal = await tx.creditNote.aggregate({ where: { workspaceId: context.workspaceId, salesOrderId: sale.id, status: { not: "CANCELLED" } }, _sum: { amount: true } });
    const remainingRefundable = Prisma.Decimal.max(new Prisma.Decimal(0), sale.total.minus(priorCreditTotal._sum.amount ?? 0));
    const rawReturnAmounts = requestedLines.map(({ request, saleItem }) => new Prisma.Decimal(saleItem.total).div(saleItem.quantity).mul(request.quantity));
    const exactCumulativeAmount = requestedLines.reduce((sum, { request, saleItem, previousReturned }) => {
      const cumulativeQuantity = previousReturned.plus(request.quantity);
      const roundedCumulative = new Prisma.Decimal(saleItem.total).mul(cumulativeQuantity).div(saleItem.quantity).toDecimalPlaces(2);
      const roundedPrevious = new Prisma.Decimal(saleItem.total).mul(previousReturned).div(saleItem.quantity).toDecimalPlaces(2);
      return sum.plus(roundedCumulative.minus(roundedPrevious));
    }, new Prisma.Decimal(0));
    const returnAmount = Prisma.Decimal.min(exactCumulativeAmount, remainingRefundable).toDecimalPlaces(2);
    const taxAllocation = allocateSalesTaxByLine(
      rawReturnAmounts,
      new Prisma.Decimal(0),
      requestedLines.map(({ saleItem }) => new Prisma.Decimal(saleItem.taxRate ?? 0)),
      returnAmount,
    );
    const taxAmount = taxAllocation.totalTax;
    const taxableReturnAmount = returnAmount.minus(taxAmount);

    for (const { request, saleItem } of requestedLines) {
      const changed = await tx.product.updateMany({ where: { id: saleItem.productId, workspaceId: context.workspaceId }, data: { stockQuantity: { increment: request.quantity } } });
      if (changed.count !== 1) throw new SaleDomainError("PRODUCT_NOT_FOUND", "A returned product no longer exists in this workspace.");
      try {
        await applyManagedWarehouseStockDelta(tx, { workspaceId: context.workspaceId, warehouseId: sale.warehouseId, productId: saleItem.productId, delta: new Prisma.Decimal(request.quantity) });
      } catch (error) {
        if (error instanceof ManagedWarehouseStockError) throw new SaleDomainError("WAREHOUSE_STOCK_ERROR", error.message);
        throw error;
      }
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: saleItem.productId, type: "RETURN", quantity: request.quantity, referenceId: sale.id, notes: `Customer return for ${sale.orderNumber}${sale.warehouseId ? ` in warehouse ${sale.warehouseId}` : ""}` } });
    }

    let restoredBomCost = new Prisma.Decimal(0);
    for (const { request, saleItem } of requestedLines) {
      const restored = await restoreReturnedBomComponents(tx, { workspaceId: context.workspaceId, actorId: context.userId, saleId: sale.id, saleItemId: saleItem.id, warehouseId: sale.warehouseId, returnQuantity: new Prisma.Decimal(request.quantity) }).catch(throwBomAsSaleError);
      restoredBomCost = restoredBomCost.plus(restored.additionalCostOfGoodsSold);
    }
    const productCostTotal = requestedLines.reduce((sum, { request, saleItem }) => sum.plus(saleItem.costPrice.mul(request.quantity)), new Prisma.Decimal(0));
    const totalCostOfGoodsSold = productCostTotal.plus(restoredBomCost);

    const returnNumber = await nextDocumentNumber(tx, context.workspaceId, "CUSTOMER_RETURN");
    const customerReturn = await tx.customerReturn.create({ data: { workspaceId: context.workspaceId, salesOrderId: sale.id, customerId: sale.customerId, number: returnNumber, reason: data.reason, total: returnAmount, taxAmount, status: "POSTED", idempotencyKey: data.idempotencyKey }, select: { id: true, total: true } });
    await tx.customerReturnItem.createMany({ data: requestedLines.map(({ request, saleItem }, index) => ({ customerReturnId: customerReturn.id, salesOrderItemId: saleItem.id, quantity: request.quantity, amount: taxAllocation.lines[index]!.gross.toDecimalPlaces(2), taxableAmount: taxAllocation.lines[index]!.taxable.toDecimalPlaces(2), taxAmount: taxAllocation.lines[index]!.tax.toDecimalPlaces(2) })) });
    await tx.creditNote.create({ data: { workspaceId: context.workspaceId, customerId: sale.customerId, salesOrderId: sale.id, customerReturnId: customerReturn.id, number: `CN-${returnNumber}`, amount: returnAmount, appliedAmount: 0, remainingAmount: returnAmount, status: "OPEN", reason: data.reason } });
    await tx.salesOrder.update({ where: { id: sale.id, workspaceId: context.workspaceId }, data: { balanceAmount: { decrement: returnAmount } } });
    await tx.customer.update({ where: { id: sale.customerId, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: returnAmount } } });
    await postCustomerReturnToGeneralLedger(tx, { workspaceId: context.workspaceId, returnId: customerReturn.id, documentNo: returnNumber, date: new Date(), returnAmount: taxableReturnAmount, taxAmount, costOfGoodsSold: totalCostOfGoodsSold });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "customer_return.created", entityType: "CustomerReturn", entityId: customerReturn.id, metadata: { saleId: sale.id, returnNumber, total: returnAmount.toString(), taxAmount: taxAmount.toString(), warehouseId: sale.warehouseId } });
    return { id: customerReturn.id };
  });
}

export async function cancelCustomerReturn(context: ServiceContext, returnId: string) {
  if (!canPerformAction(context.role, "returns.cancel")) throw new SaleDomainError("PERMISSION_DENIED", "You do not have permission to cancel returns.");
  return withSerializableRetry(async (tx) => {
    const customerReturn = await tx.customerReturn.findFirst({ where: { id: returnId, workspaceId: context.workspaceId }, include: { items: { include: { salesOrderItem: true } }, creditNote: { include: { allocations: true } }, salesOrder: true } });
    if (!customerReturn) throw new SaleDomainError("INVALID_RETURN", "Customer return not found.");
    if (customerReturn.status === "CANCELLED") return { id: customerReturn.id, status: customerReturn.status };
    if (customerReturn.creditNote?.allocations.length) throw new SaleDomainError("INVALID_RETURN", "Reverse customer credit allocations before cancelling this return.");
    for (const line of customerReturn.items) {
      const product = await tx.product.findFirst({ where: { id: line.salesOrderItem.productId, workspaceId: context.workspaceId }, select: { id: true, stockQuantity: true } });
      if (!product || product.stockQuantity.lt(line.quantity)) throw new SaleDomainError("INSUFFICIENT_STOCK", "Cannot cancel return because returned stock is no longer available.");
      const changed = await tx.product.updateMany({ where: { id: product.id, workspaceId: context.workspaceId, stockQuantity: { gte: line.quantity } }, data: { stockQuantity: { decrement: line.quantity } } });
      if (changed.count !== 1) throw new SaleDomainError("INSUFFICIENT_STOCK", "Cannot cancel return because returned stock changed during cancellation.");
      try {
        await applyManagedWarehouseStockDelta(tx, { workspaceId: context.workspaceId, warehouseId: customerReturn.salesOrder.warehouseId, productId: product.id, delta: new Prisma.Decimal(line.quantity).negated() });
      } catch (error) {
        if (error instanceof ManagedWarehouseStockError) {
          if (error.code === "NEGATIVE_WAREHOUSE_STOCK") throw new SaleDomainError("INSUFFICIENT_STOCK", "Cannot cancel return because returned stock is no longer available in the original warehouse.");
          throw new SaleDomainError("WAREHOUSE_STOCK_ERROR", error.message);
        }
        throw error;
      }
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: product.id, type: "RETURN_CANCEL", quantity: new Prisma.Decimal(line.quantity).negated(), referenceId: customerReturn.id, notes: `Cancelled customer return ${customerReturn.number}${customerReturn.salesOrder.warehouseId ? ` in warehouse ${customerReturn.salesOrder.warehouseId}` : ""}` } });
    }
    for (const line of customerReturn.items) {
      await consumeCustomerSalesBomComponents(tx, { workspaceId: context.workspaceId, actorId: context.userId, saleId: customerReturn.salesOrderId, saleNumber: customerReturn.number, warehouseId: customerReturn.salesOrder.warehouseId, saleItems: [{ saleItemId: line.salesOrderItemId, productId: line.salesOrderItem.productId, quantity: line.quantity }] }).catch(throwBomAsSaleError);
    }
    await tx.creditNote.updateMany({ where: { customerReturnId: customerReturn.id, workspaceId: context.workspaceId }, data: { status: "CANCELLED", remainingAmount: 0 } });
    await tx.customerReturn.update({ where: { id: customerReturn.id, workspaceId: context.workspaceId }, data: { status: "CANCELLED" } });
    await tx.salesOrder.update({ where: { id: customerReturn.salesOrderId, workspaceId: context.workspaceId }, data: { balanceAmount: { increment: customerReturn.total } } });
    await tx.customer.update({ where: { id: customerReturn.customerId, workspaceId: context.workspaceId }, data: { currentBalance: { increment: customerReturn.total } } });
    await reverseGeneralLedgerEntries(tx, { workspaceId: context.workspaceId, sourceType: "CUSTOMER_RETURN", sourceId: customerReturn.id, documentNo: `${customerReturn.number}-REV`, date: new Date(), narration: `Reversal of cancelled customer return ${customerReturn.number}` });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "customer_return.cancelled", entityType: "CustomerReturn", entityId: customerReturn.id, metadata: { returnNumber: customerReturn.number } });
    return { id: customerReturn.id, status: "CANCELLED" as const };
  });
}
