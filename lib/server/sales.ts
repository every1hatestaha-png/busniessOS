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
import type { InvoiceIssuedSnapshot } from "@/lib/server/invoice-snapshot";

export type ServiceContext = { workspaceId: string; role: Role; userId?: string };
export class SaleDomainError extends Error {
  constructor(public code: "CUSTOMER_NOT_FOUND" | "PRODUCT_NOT_FOUND" | "INSUFFICIENT_STOCK" | "INVALID_TOTAL" | "CREDIT_LIMIT_EXCEEDED" | "PAYMENT_PERMISSION_DENIED" | "PAYMENT_ACCOUNT_UNAVAILABLE" | "SALE_NOT_FOUND" | "INVALID_RETURN" | "PERMISSION_DENIED" | "WAREHOUSE_REQUIRED" | "WAREHOUSE_NOT_FOUND" | "WAREHOUSE_STOCK_ERROR" | "IDEMPOTENCY_CONFLICT", message: string) {
    super(message);
  }
}

export async function createSale(context: ServiceContext, input: SaleInput) {
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
    const order = await tx.salesOrder.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, orderNumber, status: "CONFIRMED", subtotal, discount, total, paidAmount: paid, balanceAmount: total.minus(paid), notes: data.notes || null, idempotencyKey: data.idempotencyKey, warehouseId: warehouseMode === "MANAGED" ? data.warehouseId! : null }, select: { id: true, orderDate: true } });
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
          if (error.code === "WAREHOUSE_REQUIRED") throw new SaleDomainError("WAREHOUSE_REQUIRED", error.message);
          if (error.code === "WAREHOUSE_NOT_FOUND") throw new SaleDomainError("WAREHOUSE_NOT_FOUND", error.message);
          throw new SaleDomainError("WAREHOUSE_STOCK_ERROR", error.message);
        }
        throw error;
      }
    }

    await tx.salesOrderItem.createMany({ data: lines.map((line, index) => {
      const product = productById.get(line.productId)!;
      const tax = taxAllocation.lines[index]!;
      return {
        salesOrderId: order.id,
        productId: line.productId,
        productName: product.name,
        productSku: product.sku,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPerUnit: line.discountPerUnit,
        totalPrice: line.total,
        taxRate: tax.taxRate,
        taxableAmount: tax.taxableAmount,
        salesTaxAmount: tax.salesTaxAmount,
        fbrHsCode: product.fbrHsCode,
        fbrUom: product.fbrUom,
        fbrUomId: product.fbrUomId,
        fbrTransactionTypeId: product.fbrTransactionTypeId,
        fbrSaleType: product.fbrTransactionTypeDesc,
        fbrRateId: product.fbrRateId,
        fbrRateDesc: product.fbrRateDesc,
        fbrRateValue: product.fbrRateValue,
        fbrReferenceVerifiedAt: product.fbrReferenceVerifiedAt,
        fbrReferenceVerifiedForDate: product.fbrReferenceVerifiedForDate,
        fbrReferenceProvinceCode: product.fbrReferenceProvinceCode,
        fbrReferenceProvinceDesc: product.fbrReferenceProvinceDesc,
        fbrHsUomVerifiedAt: product.fbrHsUomVerifiedAt,
        fbrHsUomAnnexureId: product.fbrHsUomAnnexureId,
        pricingMode: line.pricingMode,
        unitWeight: line.pricingMode === "WEIGHT" ? line.unitWeight : null,
        totalWeight: line.totalWeight,
        perKgRate: line.pricingMode === "WEIGHT" ? line.perKgRate : null,
      };
    }) });
    await tx.inventoryTransaction.createMany({ data: lines.map((line) => {
      const product = productById.get(line.productId)!;
      return { workspaceId: context.workspaceId, productId: line.productId, type: "SALE" as const, quantityChanged: -line.quantity, unitCost: product.costPrice, reference: orderNumber };
    }) });

    const dueDate = new Date(order.orderDate);
    dueDate.setDate(dueDate.getDate() + customer.creditDays);

    const [seller, warehouse] = await Promise.all([
      tx.workspace.findUniqueOrThrow({
        where: { id: context.workspaceId },
        select: { name: true, phone: true, email: true, address: true, city: true, country: true, currency: true, timezone: true, ntn: true, strn: true, province: true },
      }),
      data.warehouseId
        ? tx.$queryRaw<Array<{ id: string; name: string; code: string | null }>>`
            SELECT "id"::text AS "id", "name", "code"
            FROM "warehouses"
            WHERE "id"=${data.warehouseId}::uuid
              AND "workspaceId"=${context.workspaceId}::uuid
            LIMIT 1
          `.then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
    ]);

    const distinctTaxRates = [...new Set(taxAllocation.lines.map((line) => Number(line.taxRate)))];
    const issuedSnapshot = {
      version: 1,
      seller,
      buyer: {
        id: customer.id,
        name: customer.name,
        companyName: customer.companyName,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        taxId: customer.taxId,
        province: customer.province,
        registrationType: customer.registrationType,
      },
      order: {
        number: orderNumber,
        warehouse,
        items: lines.map((line, index) => {
          const product = productById.get(line.productId)!;
          return {
            key: `${line.productId}:${index}`,
            name: product.name,
            sku: product.sku,
            unit: product.unit,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            discountPerUnit: Number(line.discountPerUnit),
            total: Number(line.total),
            pricingMode: line.pricingMode,
            taxRate: Number(taxAllocation.lines[index]!.taxRate),
            unitWeight: line.pricingMode === "WEIGHT" ? Number(line.unitWeight) : null,
            totalWeight: line.totalWeight ? Number(line.totalWeight) : null,
            perKgRate: line.pricingMode === "WEIGHT" ? Number(line.perKgRate) : null,
          };
        }),
      },
      totals: {
        subtotal: Number(subtotal),
        discount: Number(discount),
        taxableAmount: Number(taxableAmount),
        gstRate: distinctTaxRates.length === 1 ? distinctTaxRates[0]! : null,
        gstAmount: Number(gstAmount),
        total: Number(total),
      },
    } satisfies InvoiceIssuedSnapshot;

    const invoice = await tx.invoice.create({
      data: {
        workspaceId: context.workspaceId,
        customerId: customer.id,
        salesOrderId: order.id,
        invoiceNumber,
        amount: total,
        paidAmount: paid,
        status: paid.isZero() ? "UNPAID" : paid.equals(total) ? "PAID" : "PARTIALLY_PAID",
        dueDate,
        issuedAt: order.orderDate,
        issuedSnapshot: issuedSnapshot as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await tx.invoiceDocumentVersion.create({
      data: {
        workspaceId: context.workspaceId,
        invoiceId: invoice.id,
        version: 1,
        snapshot: issuedSnapshot as unknown as Prisma.InputJsonValue,
        issuedAt: order.orderDate,
      },
    });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, type: "SALE", debit: total, description: `Sale ${orderNumber}`, referenceId: order.id } });
    await tx.customer.update({ where: { id: customer.id, workspaceId: context.workspaceId }, data: { currentBalance: { increment: total } } });
    if (paid.greaterThan(0)) {
      const paymentNumber = await nextDocumentNumber(tx, context.workspaceId, "PAYMENT_RECEIPT");
      const payment = await tx.payment.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, invoiceId: invoice.id, cashBankAccountId, documentNumber: paymentNumber, amount: paid, netAmount: paid, method: receiptMethod, reference: paymentNumber, notes: "Payment received with sale", allocations: { create: { workspaceId: context.workspaceId, invoiceId: invoice.id, amount: paid } } }, select: { id: true } });
      await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: customer.id, type: "PAYMENT_RECEIVED", credit: paid, description: `Payment ${paymentNumber}`, referenceId: payment.id } });
      await tx.customer.update({ where: { id: customer.id, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: paid } } });
    }
    await postSaleToGeneralLedger(tx, { workspaceId: context.workspaceId, saleId: order.id, orderNumber, date: order.orderDate, revenue: taxableAmount, salesTax: gstAmount, costOfGoodsSold, cashReceived: paid, cashBankAccountId });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "sale.created", entityType: "SalesOrder", entityId: order.id, metadata: {
        orderNumber,
        taxableAmount: taxableAmount.toString(),
        legacyGstRate: data.gstRate,
        taxRates: taxAllocation.lines.map((line) => line.taxRate.toString()),
        gstAmount: gstAmount.toString(),
        total: total.toString(),
      } });
    return { id: order.id };
  });
}

export async function createCustomerReturn(context: ServiceContext, input: CustomerReturnInput) {
  if (!canPerformAction(context.role, "returns.create")) throw new SaleDomainError("PERMISSION_DENIED", "Unauthorized");
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
    const previous = await tx.customerReturnItem.groupBy({ by: ["salesOrderItemId"], where: { salesOrderItemId: { in: itemIds }, customerReturn: { workspaceId: context.workspaceId, creditNote: { is: { status: { not: "CANCELLED" } } } } }, _sum: { quantity: true } });
    const refundableBase = order.items.reduce((sum, entry) => sum.plus(entry.totalPrice), new Prisma.Decimal(0));
    const lines = data.items.map((item) => {
      const source = order.items.find((entry) => entry.id === item.itemId);
      const returned = Number(previous.find((entry) => entry.salesOrderItemId === item.itemId)?._sum.quantity ?? 0);
      if (!source || item.quantity > source.quantity.toNumber() - returned) throw new SaleDomainError("INVALID_RETURN", "Return quantity exceeds sold quantity.");
      const hasTaxSnapshot = source.taxableAmount !== null && source.salesTaxAmount !== null;
      const allocatedLineTotal = hasTaxSnapshot
        ? source.taxableAmount!.plus(source.salesTaxAmount!)
        : refundableBase.isZero()
          ? new Prisma.Decimal(0)
          : source.totalPrice.mul(order.total).div(refundableBase);
      const unitPrice = allocatedLineTotal.div(source.quantity);
      const salesTax = hasTaxSnapshot
        ? source.salesTaxAmount!.div(source.quantity).mul(item.quantity).toDecimalPlaces(2)
        : new Prisma.Decimal(0);
      return { source, quantity: item.quantity, unitPrice, total: unitPrice.mul(item.quantity).toDecimalPlaces(2), salesTax };
    });
    const total = lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0));
    const hasCompleteTaxSnapshot = lines.every((line) => line.source.taxableAmount !== null && line.source.salesTaxAmount !== null);
    const taxableOrderAmount = order.subtotal.minus(order.discount);
    const orderSalesTax = Prisma.Decimal.max(order.total.minus(taxableOrderAmount), new Prisma.Decimal(0));
    const returnSalesTax = hasCompleteTaxSnapshot
      ? lines.reduce((sum, line) => sum.plus(line.salesTax), new Prisma.Decimal(0)).toDecimalPlaces(2)
      : order.total.greaterThan(0) && orderSalesTax.greaterThan(0)
        ? total.mul(orderSalesTax).div(order.total).toDecimalPlaces(2)
        : new Prisma.Decimal(0);
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
        try {
          await applyManagedWarehouseStockDelta(tx, {
            workspaceId: context.workspaceId,
            warehouseId: order.warehouseId,
            productId: line.source.productId,
            delta: line.quantity,
          });
        } catch (error) {
          if (error instanceof ManagedWarehouseStockError) {
            throw new SaleDomainError("WAREHOUSE_STOCK_ERROR", `Returned stock could not be restored to the sale warehouse: ${error.message}`);
          }
          throw error;
        }
        await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: line.source.productId, type: "RETURN_IN", quantityChanged: line.quantity, unitCost: historicalCost, reference: number } });
      }
    }
    await tx.creditNote.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, salesOrderId: order.id, customerReturnId: customerReturn.id, number: noteNumber, reason: data.reason || "Customer return", amount: total, appliedAmount: 0, remainingAmount: total, status: "OPEN", reference: number, notes: data.notes || null } });
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, type: "SALES_RETURN", credit: total, description: `Customer return ${number}`, referenceId: customerReturn.id } });
    await tx.customer.update({ where: { id: order.customerId, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: total } } });
    await postCustomerReturnToGeneralLedger(tx, { workspaceId: context.workspaceId, returnId: customerReturn.id, documentNo: number, date: customerReturn.date, amount: total, salesTax: returnSalesTax, inventoryCost });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "customer_return.created", entityType: "CustomerReturn", entityId: customerReturn.id, metadata: { salesOrderId: order.id, total: total.toString() } });
    return customerReturn;
  });
}

export async function cancelSale(context: ServiceContext, id: string, reverseInitialPayment: boolean) {
  if (!canPerformAction(context.role, "financial.manage")) throw new SaleDomainError("PERMISSION_DENIED", "Unauthorized");
  return withSerializableRetry(async (tx) => {
    const order = await tx.salesOrder.findFirst({ where: { id, workspaceId: context.workspaceId }, include: { items: true, returns: { where: { creditNote: { is: { status: { not: "CANCELLED" } } } }, select: { id: true }, take: 1 }, invoices: { include: { payments: { where: { isReversed: false }, orderBy: { createdAt: "asc" } }, allocations: { where: { payment: { isReversed: false } }, select: { paymentId: true } }, creditAllocations: { select: { id: true }, take: 1 } } } } });
    if (!order) throw new SaleDomainError("CUSTOMER_NOT_FOUND", "Sale not found.");
    if (order.status === "CANCELLED") return { id: order.id };
    const invoice = order.invoices[0];
    const activePayments = invoice?.payments ?? [];
    const initial = activePayments.find((payment) => payment.notes === "Payment received with sale");
    const laterPayments = activePayments.filter((payment) => payment.id !== initial?.id);
    const laterAllocations = invoice?.allocations.filter((allocation) => allocation.paymentId !== initial?.id) ?? [];
    if (order.returns.length) throw new SaleDomainError("INVALID_RETURN", "Sale cannot be cancelled after active customer returns have been recorded.");
    if (invoice && (!invoice.creditApplied.isZero() || invoice.creditAllocations.length > 0)) throw new SaleDomainError("INVALID_TOTAL", "Sale cannot be cancelled after customer credit has been applied to its invoice.");
    if (laterPayments.length || laterAllocations.length > 0) throw new SaleDomainError("INVALID_TOTAL", "Sale cannot be cancelled after later payments have been recorded.");
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
      try {
        await applyManagedWarehouseStockDelta(tx, {
          workspaceId: context.workspaceId,
          warehouseId: order.warehouseId,
          productId: item.productId,
          delta: item.quantity,
        });
      } catch (error) {
        if (error instanceof ManagedWarehouseStockError) {
          throw new SaleDomainError("WAREHOUSE_STOCK_ERROR", `Cancelled sale stock could not be restored to its warehouse: ${error.message}`);
        }
        throw error;
      }
      await tx.inventoryTransaction.create({ data: { workspaceId: context.workspaceId, productId: item.productId, type: "SALE_CANCELLATION", quantityChanged: itemQty, unitCost: historicalCost, reference: order.orderNumber } });
    }
    await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, type: "REVERSAL", credit: order.total, description: `Cancelled sale ${order.orderNumber}`, referenceId: order.id } });
    await tx.customer.update({ where: { id: order.customerId, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: order.total } } });
    if (initial) {
      const reversal = await tx.payment.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, invoiceId: invoice?.id, cashBankAccountId: initial.cashBankAccountId, amount: initial.amount, method: initial.method, reference: `REV-${initial.reference ?? initial.id}`, notes: "Initial sale payment reversal", reversalOfId: initial.id } });
      await tx.payment.update({ where: { id: initial.id, workspaceId: context.workspaceId }, data: { isReversed: true, reversedAt: new Date() } });
      await tx.ledgerEntry.create({ data: { workspaceId: context.workspaceId, customerId: order.customerId, type: "REVERSAL", debit: initial.amount, description: `Reversed payment ${initial.reference ?? initial.id}`, referenceId: reversal.id } });
      await tx.customer.update({ where: { id: order.customerId, workspaceId: context.workspaceId }, data: { currentBalance: { increment: initial.amount } } });
      if (initial.cashBankAccountId) await tx.cashBankAccount.update({ where: { id: initial.cashBankAccountId, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: initial.amount } } });
    }
    await reverseGeneralLedgerEntries(tx, { workspaceId: context.workspaceId, sources: [{ sourceType: "SALE", sourceId: order.id }, { sourceType: "RECEIPT", sourceId: order.id }], documentNo: `REV-${order.orderNumber}`, date: new Date(), reason: `Cancelled sale ${order.orderNumber}`, reversedById: context.userId });
    if (invoice) await tx.invoice.update({ where: { id: invoice.id, workspaceId: context.workspaceId }, data: { status: "CANCELLED", paidAmount: 0 } });
    await tx.salesOrder.update({ where: { id: order.id, workspaceId: context.workspaceId }, data: { status: "CANCELLED", paidAmount: 0, balanceAmount: 0, cancelledAt: new Date(), cancelledById: context.userId } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "sale.cancelled", entityType: "SalesOrder", entityId: order.id, metadata: { initialPaymentReversed: Boolean(initial) } });
    return { id: order.id };
  });
}

export async function listSales(workspaceId: string) {
  const rows = await db.salesOrder.findMany({ where: { workspaceId }, orderBy: { orderDate: "desc" }, include: { customer: { select: { companyName: true, name: true } }, _count: { select: { items: true } } } });
  return rows.map((row) => ({ id: row.id, orderNumber: row.orderNumber, customerName: row.customer.companyName ?? row.customer.name, date: row.orderDate.toISOString(), items: row._count.items, total: Number(row.total), paidAmount: Number(row.paidAmount), balanceAmount: Number(row.balanceAmount), status: row.status }));
}

export async function getSale(workspaceId: string, id: string) {
  const row = await db.salesOrder.findFirst({
    where: { id, workspaceId },
    include: {
      customer: true,
      items: { include: { product: { select: { name: true, sku: true } } } },
      invoices: true,
      returns: {
        orderBy: { date: "desc" },
        include: {
          creditNote: { select: { id: true, number: true, status: true, amount: true, appliedAmount: true, remainingAmount: true } },
          items: { select: { id: true, salesOrderItemId: true, productId: true, quantity: true, totalPrice: true } },
        },
      },
    },
  });
  if (!row) return null;
  const warehouse = row.warehouseId
    ? (await db.$queryRaw<Array<{ id: string; name: string; code: string }>>`
        SELECT "id"::text AS "id", "name", "code"
        FROM "warehouses"
        WHERE "id"=${row.warehouseId}::uuid
          AND "workspaceId"=${workspaceId}::uuid
        LIMIT 1
      `)[0] ?? null
    : null;
  const taxableAmount = Math.max(0, Number(row.subtotal) - Number(row.discount));
  const gstAmount = Math.max(0, Number(row.total) - taxableAmount);
  const aggregateGstRate = taxableAmount > 0 ? Number(((gstAmount / taxableAmount) * 100).toFixed(4)) : 0;
  const hasCompleteTaxRates = row.items.length > 0 && row.items.every((item) => item.taxRate !== null);
  const storedTaxRates = hasCompleteTaxRates
    ? [...new Set(row.items.map((item) => Number(item.taxRate)))]
    : [];
  const gstRate = storedTaxRates.length > 1 ? null : (storedTaxRates[0] ?? aggregateGstRate);
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    date: row.orderDate.toISOString(),
    status: row.status,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    taxableAmount,
    gstRate,
    gstAmount,
    total: Number(row.total),
    paidAmount: Number(row.paidAmount),
    balanceAmount: Number(row.balanceAmount),
    notes: row.notes ?? "",
    warehouse,
    customer: { id: row.customer.id, name: row.customer.name, companyName: row.customer.companyName ?? row.customer.name, phone: row.customer.phone ?? "", address: row.customer.address ?? "", currentBalance: Number(row.customer.currentBalance), creditDays: row.customer.creditDays, creditLimit: Number(row.customer.creditLimit) },
    items: row.items.map((item) => ({ id: item.id, productName: item.productName ?? item.product.name, sku: item.productSku ?? item.product.sku ?? "", quantity: item.quantity, unitPrice: Number(item.unitPrice), discountPerUnit: Number(item.discountPerUnit), total: Number(item.totalPrice), pricingMode: item.pricingMode, taxRate: item.taxRate ? Number(item.taxRate) : null, unitWeight: item.unitWeight ? Number(item.unitWeight) : null, totalWeight: item.totalWeight ? Number(item.totalWeight) : null, perKgRate: item.perKgRate ? Number(item.perKgRate) : null })),
    invoice: row.invoices[0] ? { id: row.invoices[0].id, number: row.invoices[0].invoiceNumber } : null,
    returns: row.returns.map((entry) => ({
      id: entry.id,
      number: entry.number,
      date: entry.date.toISOString(),
      reason: entry.reason ?? "",
      total: Number(entry.totalAmount),
      restock: entry.restock,
      notes: entry.notes ?? "",
      creditNote: entry.creditNote ? { id: entry.creditNote.id, number: entry.creditNote.number, status: entry.creditNote.status, amount: Number(entry.creditNote.amount), appliedAmount: Number(entry.creditNote.appliedAmount), remainingAmount: Number(entry.creditNote.remainingAmount) } : null,
      items: entry.items.map((item) => ({ id: item.id, salesOrderItemId: item.salesOrderItemId, productId: item.productId, quantity: Number(item.quantity), total: Number(item.totalPrice) })),
    })),
  };
}
