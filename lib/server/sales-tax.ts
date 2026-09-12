import "server-only";

import { Prisma } from "@prisma/client";

import { postSaleToGeneralLedger } from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";
import { canPerformAction } from "@/lib/server/authorization";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import { SaleDomainError, type ServiceContext } from "@/lib/server/sales";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { formatPKR } from "@/lib/utils";
import { saleSchema, type SaleInput } from "@/lib/validation/sale";

async function ensureSalesTaxPayableAccount(tx: Prisma.TransactionClient, workspaceId: string) {
  const existing = await tx.account.findFirst({
    where: { workspaceId, name: "Sales Tax Payable", category: "LIABILITY" },
    select: { id: true },
  });
  if (existing) return existing;

  for (const code of ["2110", "2120", "2190", "2199"]) {
    const taken = await tx.account.findFirst({ where: { workspaceId, code }, select: { id: true } });
    if (!taken) {
      return tx.account.create({
        data: {
          workspaceId,
          code,
          name: "Sales Tax Payable",
          category: "LIABILITY",
          normalBalance: "CREDIT",
          isActive: true,
        },
        select: { id: true },
      });
    }
  }

  throw new SaleDomainError("INVALID_TOTAL", "Unable to configure the Sales Tax Payable account for this workspace.");
}

function computeTax(preTaxTotal: Prisma.Decimal, enabled: boolean, ratePercent: number, mode: "EXCLUSIVE" | "INCLUSIVE") {
  if (!enabled || ratePercent <= 0 || preTaxTotal.lessThanOrEqualTo(0)) {
    return { taxableAmount: preTaxTotal, taxAmount: new Prisma.Decimal(0), total: preTaxTotal };
  }

  const rate = new Prisma.Decimal(ratePercent).div(100);
  if (mode === "INCLUSIVE") {
    const taxableAmount = preTaxTotal.div(new Prisma.Decimal(1).plus(rate)).toDecimalPlaces(2);
    const taxAmount = preTaxTotal.minus(taxableAmount).toDecimalPlaces(2);
    return { taxableAmount, taxAmount, total: preTaxTotal };
  }

  const taxAmount = preTaxTotal.mul(rate).toDecimalPlaces(2);
  return { taxableAmount: preTaxTotal, taxAmount, total: preTaxTotal.plus(taxAmount) };
}

/**
 * Tax-aware sale creation. It preserves the same finance and inventory invariants
 * as the original createSale path, while keeping tax as a separate liability.
 */
export async function createSaleWithTax(context: ServiceContext, input: SaleInput) {
  const data = saleSchema.parse(input);

  return withSerializableRetry(async (tx) => {
    const existing = await tx.salesOrder.findFirst({
      where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey },
      select: { id: true },
    });
    if (existing) return existing;

    const customer = await tx.customer.findFirst({
      where: { id: data.customerId, workspaceId: context.workspaceId, status: "ACTIVE" },
      select: { id: true, currentBalance: true, creditLimit: true, creditDays: true },
    });
    if (!customer) throw new SaleDomainError("CUSTOMER_NOT_FOUND", "Customer is unavailable.");

    const products = await tx.product.findMany({
      where: { workspaceId: context.workspaceId, id: { in: data.items.map((item) => item.productId) }, status: "ACTIVE" },
      select: { id: true, name: true, sku: true, stockQuantity: true, costPrice: true },
    });
    if (products.length !== data.items.length) throw new SaleDomainError("PRODUCT_NOT_FOUND", "One or more products are unavailable.");

    const lines = data.items.map((item) => {
      const unitPrice = item.pricingMode === "WEIGHT"
        ? new Prisma.Decimal(item.unitWeight!).mul(item.perKgRate!)
        : new Prisma.Decimal(item.unitPrice);
      const totalWeight = item.pricingMode === "WEIGHT" ? new Prisma.Decimal(item.unitWeight!).mul(item.quantity) : null;
      const gross = unitPrice.mul(item.quantity);
      const discountPerUnit = new Prisma.Decimal(item.discountPerUnit);
      const discount = discountPerUnit.mul(item.quantity);
      return { ...item, unitPrice, totalWeight, total: gross.minus(discount) };
    });

    const subtotal = lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.unitPrice).mul(line.quantity)), new Prisma.Decimal(0));
    const lineDiscount = lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.discountPerUnit).mul(line.quantity)), new Prisma.Decimal(0));
    const discount = lineDiscount.plus(data.orderDiscount);
    const preTaxTotal = subtotal.minus(discount);
    if (preTaxTotal.isNegative()) throw new SaleDomainError("INVALID_TOTAL", "Discount exceeds the order total.");

    const tax = computeTax(preTaxTotal, data.taxEnabled, data.taxRate, data.taxMode);
    const total = tax.total;
    const paid = new Prisma.Decimal(data.paidAmount);
    if (paid.greaterThan(total)) throw new SaleDomainError("INVALID_TOTAL", "Payment exceeds the order total.");
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
      const cashBankAccount = await tx.cashBankAccount.findFirst({
        where: { id: cashBankAccountId!, workspaceId: context.workspaceId, isActive: true },
        select: { id: true, isBank: true },
      });
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
    const order = await tx.salesOrder.create({
      data: {
        workspaceId: context.workspaceId,
        customerId: customer.id,
        orderNumber,
        status: "CONFIRMED",
        subtotal,
        discount,
        total,
        paidAmount: paid,
        balanceAmount: total.minus(paid),
        notes: data.notes || null,
        idempotencyKey: data.idempotencyKey,
      },
      select: { id: true, orderDate: true },
    });

    if (data.taxEnabled && tax.taxAmount.greaterThan(0)) {
      await tx.$executeRaw`
        INSERT INTO "sales_tax_details" (
          "salesOrderId", "workspaceId", "taxRate", "taxMode", "taxableAmount", "taxAmount"
        ) VALUES (
          ${order.id}, ${context.workspaceId}, ${new Prisma.Decimal(data.taxRate)}, ${data.taxMode}, ${tax.taxableAmount}, ${tax.taxAmount}
        )
      `;
    }

    let costOfGoodsSold = new Prisma.Decimal(0);
    const productById = new Map(products.map((product) => [product.id, product]));

    for (const line of lines) {
      const product = productById.get(line.productId)!;
      costOfGoodsSold = costOfGoodsSold.plus(product.costPrice.mul(line.quantity));
      const changed = await tx.product.updateMany({
        where: { id: line.productId, workspaceId: context.workspaceId, stockQuantity: { gte: line.quantity } },
        data: { stockQuantity: { decrement: line.quantity } },
      });
      if (changed.count !== 1) throw new SaleDomainError("INSUFFICIENT_STOCK", `Unable to create sale because ${product.name} does not have sufficient inventory.`);
    }

    await tx.salesOrderItem.createMany({
      data: lines.map((line) => {
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
          totalWeight: line.totalWeight,
          perKgRate: line.pricingMode === "WEIGHT" ? line.perKgRate : null,
        };
      }),
    });

    await tx.inventoryTransaction.createMany({
      data: lines.map((line) => {
        const product = productById.get(line.productId)!;
        return {
          workspaceId: context.workspaceId,
          productId: line.productId,
          type: "SALE" as const,
          quantityChanged: -line.quantity,
          unitCost: product.costPrice,
          reference: orderNumber,
        };
      }),
    });

    const dueDate = new Date(order.orderDate);
    dueDate.setDate(dueDate.getDate() + customer.creditDays);
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
      },
      select: { id: true },
    });

    await tx.ledgerEntry.create({
      data: {
        workspaceId: context.workspaceId,
        customerId: customer.id,
        type: "SALE",
        debit: total,
        description: `Sale ${orderNumber}`,
        referenceId: order.id,
      },
    });
    await tx.customer.update({ where: { id: customer.id, workspaceId: context.workspaceId }, data: { currentBalance: { increment: total } } });

    if (paid.greaterThan(0)) {
      const paymentNumber = await nextDocumentNumber(tx, context.workspaceId, "PAYMENT_RECEIPT");
      const payment = await tx.payment.create({
        data: {
          workspaceId: context.workspaceId,
          customerId: customer.id,
          invoiceId: invoice.id,
          cashBankAccountId,
          documentNumber: paymentNumber,
          amount: paid,
          netAmount: paid,
          method: receiptMethod,
          reference: paymentNumber,
          notes: "Payment received with sale",
          allocations: { create: { workspaceId: context.workspaceId, invoiceId: invoice.id, amount: paid } },
        },
        select: { id: true },
      });
      await tx.ledgerEntry.create({
        data: {
          workspaceId: context.workspaceId,
          customerId: customer.id,
          type: "PAYMENT_RECEIVED",
          credit: paid,
          description: `Payment ${paymentNumber}`,
          referenceId: payment.id,
        },
      });
      await tx.customer.update({ where: { id: customer.id, workspaceId: context.workspaceId }, data: { currentBalance: { decrement: paid } } });
    }

    // Existing sale posting debits AR and credits revenue for the invoice total.
    // A balanced adjustment then moves the tax portion out of revenue and into
    // a dedicated liability, so P&L and tax payable remain correct.
    await postSaleToGeneralLedger(tx, {
      workspaceId: context.workspaceId,
      saleId: order.id,
      orderNumber,
      date: order.orderDate,
      revenue: total,
      costOfGoodsSold,
      cashReceived: paid,
      cashBankAccountId,
    });

    if (data.taxEnabled && tax.taxAmount.greaterThan(0)) {
      const [salesRevenue, salesTaxPayable] = await Promise.all([
        tx.account.findUniqueOrThrow({
          where: { workspaceId_systemCode: { workspaceId: context.workspaceId, systemCode: "SALES_REVENUE" } },
          select: { id: true },
        }),
        ensureSalesTaxPayableAccount(tx, context.workspaceId),
      ]);
      await tx.generalLedgerEntry.createMany({
        data: [
          {
            workspaceId: context.workspaceId,
            accountId: salesRevenue.id,
            sourceType: "SALE",
            sourceId: order.id,
            documentNo: orderNumber,
            date: order.orderDate,
            narration: `Sales tax reclassification ${orderNumber}`,
            debit: tax.taxAmount,
            credit: 0,
          },
          {
            workspaceId: context.workspaceId,
            accountId: salesTaxPayable.id,
            sourceType: "SALE",
            sourceId: order.id,
            documentNo: orderNumber,
            date: order.orderDate,
            narration: `Sales tax payable ${orderNumber}`,
            debit: 0,
            credit: tax.taxAmount,
          },
        ],
      });
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "sale.created",
      entityType: "SalesOrder",
      entityId: order.id,
      metadata: {
        orderNumber,
        total: total.toString(),
        taxEnabled: data.taxEnabled,
        taxRate: data.taxEnabled ? data.taxRate : 0,
        taxMode: data.taxEnabled ? data.taxMode : null,
        taxableAmount: tax.taxableAmount.toString(),
        taxAmount: tax.taxAmount.toString(),
      },
    });

    return { id: order.id };
  });
}
