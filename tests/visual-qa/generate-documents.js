"use strict";

require("dotenv").config({ path: require("node:path").resolve(__dirname, "../../.env.local") });

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient, Prisma } = require("@prisma/client");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

function withExplicitSslMode(url) {
  const parsed = new URL(url);
  const sslMode = parsed.searchParams.get("sslmode");
  if (!sslMode || ["prefer", "require", "verify-ca"].includes(sslMode)) parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

const adapter = new PrismaPg({ connectionString: withExplicitSslMode(connectionString) });
const prisma = new PrismaClient({ adapter });

const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "visual-qa-ids.json"), "utf8"));

if (ids.workspaceId !== "visual-qa-workspace") {
  throw new Error("Refusing to generate documents outside visual-qa-workspace.");
}

const documentIds = { invoices: {}, purchaseOrders: {}, grns: {}, reports: {} };

function decimal(value) {
  return new Prisma.Decimal(value);
}

function itemAmount(item) {
  if (item.perKgRate != null) {
    return decimal(item.quantity).mul(item.unitWeight || 1).mul(item.perKgRate);
  }
  return decimal(item.quantity).mul(item.unitCost);
}

async function resetTransactionData() {
  const workspaceId = ids.workspaceId;
  await prisma.customerCreditAllocation.deleteMany({ where: { workspaceId } });
  await prisma.paymentAllocation.deleteMany({ where: { workspaceId } });
  await prisma.creditNote.deleteMany({ where: { workspaceId } });
  await prisma.customerReturn.deleteMany({ where: { workspaceId } });
  await prisma.supplierReturn.deleteMany({ where: { workspaceId } });
  await prisma.goodReceivedNote.deleteMany({ where: { workspaceId } });
  await prisma.payment.deleteMany({ where: { workspaceId } });
  await prisma.invoice.deleteMany({ where: { workspaceId } });
  await prisma.salesOrder.deleteMany({ where: { workspaceId } });
  await prisma.debitNote.deleteMany({ where: { workspaceId } });
  await prisma.purchaseOrder.deleteMany({ where: { workspaceId } });
  await prisma.expense.deleteMany({ where: { workspaceId } });
  await prisma.generalLedgerEntry.deleteMany({ where: { workspaceId } });
  await prisma.ledgerEntry.deleteMany({ where: { workspaceId } });
  await prisma.inventoryTransaction.deleteMany({ where: { workspaceId } });
  await prisma.customer.updateMany({ where: { workspaceId }, data: { currentBalance: 0 } });
  await prisma.supplier.updateMany({ where: { workspaceId }, data: { currentBalance: 0 } });
  await Promise.all([
    prisma.product.update({ where: { id: ids.productPieceId }, data: { stockQuantity: 1000, costPrice: 150 } }),
    prisma.product.update({ where: { id: ids.productLongDescId }, data: { stockQuantity: 500, costPrice: 500 } }),
    prisma.product.update({ where: { id: ids.productWeightId }, data: { stockQuantity: 5000, costPrice: 180 } }),
    prisma.product.update({ where: { id: ids.productWeightHeavyId }, data: { stockQuantity: 10000, costPrice: 220 } }),
    prisma.cashBankAccount.update({ where: { id: ids.cashAccountId }, data: { currentBalance: 50000 } }),
    prisma.cashBankAccount.update({ where: { id: ids.bankAccountId }, data: { currentBalance: 1000000 } }),
  ]);
}

async function getProductNames(productIds) {
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } });
  const map = {};
  for (const p of products) { map[p.id] = { name: p.name, sku: p.sku }; }
  return map;
}

async function main() {
  console.log("Generating visual QA documents...");

  await resetTransactionData();

  const productNameMap = await getProductNames([
    ids.productPieceId, ids.productLongDescId, ids.productWeightId, ids.productWeightHeavyId
  ]);

  // ===== INVOICES =====
  console.log("Creating invoices...");

  async function createInvoiceScenario(name, overrides = {}) {
    const customerId = overrides.customerId || ids.customer1Id;
    const items = overrides.items || [{ productId: ids.productPieceId, quantity: 1, unitPrice: 250, discount: 0 }];

    const order = await prisma.salesOrder.create({
      data: {
        workspaceId: ids.workspaceId,
        customerId,
        orderNumber: `SO-VQA-${name}-${randomUUID().slice(0, 8)}`,
        status: overrides.status || "CONFIRMED",
        subtotal: items.reduce((sum, i) => sum + i.quantity * i.unitPrice - i.discount, 0),
        total: items.reduce((sum, i) => sum + i.quantity * i.unitPrice - i.discount, 0),
        balanceAmount: items.reduce((sum, i) => sum + i.quantity * i.unitPrice - i.discount, 0),
        orderDate: overrides.issuedAt || new Date(),
        items: {
          create: items.map(item => {
            const p = productNameMap[item.productId];
            const lineTotal = item.quantity * item.unitPrice - (item.discount || 0);
            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              totalPrice: lineTotal,
              productName: p.name,
              productSku: p.sku,
            };
          })
        }
      },
      include: { items: true }
    });

    const invoice = await prisma.invoice.create({
      data: {
        workspaceId: ids.workspaceId,
        customerId,
        salesOrderId: order.id,
        invoiceNumber: `INV-VQA-${name}-${randomUUID().slice(0, 8)}`,
        amount: new Prisma.Decimal(order.total),
        paidAmount: new Prisma.Decimal(overrides.paidAmount || 0),
        creditApplied: new Prisma.Decimal(0),
        status: overrides.invoiceStatus || (overrides.paidAmount >= order.total ? "PAID" : overrides.paidAmount > 0 ? "PARTIALLY_PAID" : "UNPAID"),
        issuedAt: overrides.issuedAt || new Date(),
        dueDate: overrides.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }
    });

    if (overrides.paidAmount && overrides.paidAmount > 0) {
      const cashBankAccount = await prisma.cashBankAccount.findFirst({ where: { workspaceId: ids.workspaceId, isActive: true } });
      const paymentNumber = `RCPT-VQA-${name}-${randomUUID().slice(0, 8)}`;
      await prisma.payment.create({
        data: {
          workspaceId: ids.workspaceId,
          customerId,
          invoiceId: invoice.id,
          cashBankAccountId: cashBankAccount.id,
          documentNumber: paymentNumber,
          amount: new Prisma.Decimal(overrides.paidAmount),
          netAmount: new Prisma.Decimal(overrides.paidAmount),
          method: "CASH",
          reference: `Payment for ${invoice.invoiceNumber}`,
          paymentDate: new Date(),
        }
      });
    }

    documentIds.invoices[name] = invoice.id;
    return { order, invoice };
  }

  console.log("Creating invoices...");

  await createInvoiceScenario("1-line", { customerId: ids.customer1Id, items: [{ productId: ids.productPieceId, quantity: 1, unitPrice: 250, discount: 0 }] });

  await createInvoiceScenario("5-line", {
    customerId: ids.customer1Id,
    items: [
      { productId: ids.productPieceId, quantity: 2, unitPrice: 250, discount: 10 },
      { productId: ids.productLongDescId, quantity: 1, unitPrice: 850, discount: 50 },
      { productId: ids.productWeightId, quantity: 10, unitPrice: 280, discount: 0 },
      { productId: ids.productWeightHeavyId, quantity: 5, unitPrice: 285, discount: 20 },
      { productId: ids.productPieceId, quantity: 3, unitPrice: 250, discount: 0 },
    ]
  });

  const items25 = Array.from({ length: 25 }, (_, i) => ({
    productId: i % 2 === 0 ? ids.productPieceId : ids.productLongDescId,
    quantity: (i % 5) + 1,
    unitPrice: i % 2 === 0 ? 250 : 850,
    discount: i % 3 === 0 ? 25 : 0,
  }));
  await createInvoiceScenario("25-line", { customerId: ids.customer1Id, items: items25 });

  const items100 = Array.from({ length: 100 }, (_, i) => ({
    productId: [ids.productPieceId, ids.productLongDescId, ids.productWeightId, ids.productWeightHeavyId][i % 4],
    quantity: (i % 10) + 1,
    unitPrice: [250, 850, 280, 285][i % 4],
    discount: i % 7 === 0 ? 50 : 0,
  }));
  await createInvoiceScenario("100-line", { customerId: ids.customer1Id, items: items100 });

  await createInvoiceScenario("long-name", { customerId: ids.customerLongNameId, items: [{ productId: ids.productPieceId, quantity: 3, unitPrice: 250, discount: 0 }] });

  await createInvoiceScenario("decimal-qty", { customerId: ids.customer1Id, items: [{ productId: ids.productWeightId, quantity: 4.60, unitPrice: 280, discount: 0 }] });

  await createInvoiceScenario("weight-qty", { customerId: ids.customer1Id, items: [{ productId: ids.productWeightId, quantity: 25.5, unitPrice: 280, discount: 0 }] });

  await createInvoiceScenario("large-pkr", { customerId: ids.customer1Id, items: [{ productId: ids.productPieceId, quantity: 1000, unitPrice: 50000, discount: 0 }] });

  await createInvoiceScenario("partial-paid", { customerId: ids.customer1Id, items: [{ productId: ids.productPieceId, quantity: 10, unitPrice: 250, discount: 0 }], paidAmount: 1500, invoiceStatus: "PARTIALLY_PAID" });

  await createInvoiceScenario("paid", { customerId: ids.customer1Id, items: [{ productId: ids.productPieceId, quantity: 5, unitPrice: 250, discount: 0 }], paidAmount: 1250, invoiceStatus: "PAID" });

  await createInvoiceScenario("void", { customerId: ids.customer1Id, items: [{ productId: ids.productPieceId, quantity: 1, unitPrice: 250, discount: 0 }], status: "CANCELLED", invoiceStatus: "CANCELLED" });

  for (const ageDays of [15, 45, 75, 120]) {
    const issuedAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    await createInvoiceScenario(`aging-${ageDays}`, {
      customerId: ids.customer1Id,
      items: [{ productId: ids.productPieceId, quantity: ageDays, unitPrice: 250, discount: 0 }],
      issuedAt,
      dueDate: new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      invoiceStatus: ageDays > 30 ? "OVERDUE" : "UNPAID",
    });
  }

  console.log("Invoices created");

  // ===== PURCHASE ORDERS =====
  console.log("Creating purchase orders...");

  async function createPOScenario(name, overrides = {}) {
    const supplierId = overrides.supplierId || ids.supplier1Id;
    const items = overrides.items || [{ productId: ids.productPieceId, quantity: 10, unitCost: 150, unit: "PIECE" }];

    const totalAmount = items.reduce((sum, item) => sum.plus(itemAmount(item)), decimal(0));

    const order = await prisma.purchaseOrder.create({
      data: {
        workspaceId: ids.workspaceId,
        supplierId,
        orderNumber: `PO-VQA-${name}-${randomUUID().slice(0, 8)}`,
        status: overrides.status || "DRAFT",
        pricingMode: overrides.pricingMode || "UNIT",
        totalAmount,
        balanceAmount: totalAmount,
        items: {
          create: items.map(item => {
            const p = productNameMap[item.productId];
            return {
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: itemAmount(item),
              productName: p.name,
              productSku: p.sku,
              unitWeight: item.unitWeight,
              totalWeight: item.perKgRate != null ? decimal(item.quantity).mul(item.unitWeight || 1) : null,
              perKgRate: item.perKgRate,
            };
          })
        }
      },
      include: { items: true }
    });

    documentIds.purchaseOrders[name] = order.id;
    return order;
  }

  await createPOScenario("basic", {
    supplierId: ids.supplier1Id,
    items: [
      { productId: ids.productPieceId, quantity: 50, unitCost: 150, unit: "PIECE" },
      { productId: ids.productLongDescId, quantity: 20, unitCost: 500, unit: "PIECE" },
    ]
  });

  await createPOScenario("long-supplier", {
    supplierId: ids.supplierLongId,
    items: [{ productId: ids.productPieceId, quantity: 100, unitCost: 150, unit: "PIECE" }]
  });

  const weightPO = await createPOScenario("weight", {
    supplierId: ids.supplier1Id,
    items: [
      { productId: ids.productWeightId, quantity: 5000, unitCost: 180, unit: "KG", unitWeight: 1, perKgRate: 180 },
      { productId: ids.productWeightHeavyId, quantity: 10000, unitCost: 220, unit: "KG", unitWeight: 2.47, perKgRate: 220 },
    ],
    pricingMode: "WEIGHT"
  });

  const multiPO = await createPOScenario("25-line", {
    supplierId: ids.supplier1Id,
    items: Array.from({ length: 25 }, (_, index) => ({
      productId: index % 2 === 0 ? ids.productPieceId : ids.productLongDescId,
      quantity: (index % 5) + 1,
      unitCost: index % 2 === 0 ? 150 : 500,
    })),
  });

  console.log("Purchase orders created");

  // ===== GOODS RECEIPT NOTES =====
  console.log("Creating GRNs...");

  async function createGRNScenario(name, overrides = {}) {
    const po = overrides.po || await prisma.purchaseOrder.findFirst({ where: { workspaceId: ids.workspaceId, orderNumber: { startsWith: "PO-VQA-" } }, include: { items: true } });
    if (!po) throw new Error("PO not found for GRN");

    const items = po.items.map(item => {
      const lineAmount = item.perKgRate
        ? (overrides.acceptedWeight || item.quantity * (item.unitWeight || 1)) * item.perKgRate
        : (overrides.acceptedQty || item.quantity) * item.unitCost;
      const totalCost = lineAmount;

      return {
        purchaseOrderItemId: item.id,
        productId: item.productId,
        orderedQuantity: item.quantity,
        receivedQuantity: overrides.receivedQty || item.quantity,
        acceptedQuantity: overrides.acceptedQty || item.quantity,
        unitCost: item.unitCost,
        totalCost,
        receivedWeightKg: item.perKgRate ? (overrides.receivedWeight || item.quantity * (item.unitWeight || 1)) : null,
        acceptedWeightKg: item.perKgRate ? (overrides.acceptedWeight || item.quantity * (item.unitWeight || 1)) : null,
        ratePerKg: item.perKgRate || null,
        lineAmount,
      };
    });

    const totalAmount = items.reduce((sum, item) => sum.plus(item.totalCost), decimal(0));

    const grn = await prisma.goodReceivedNote.create({
      data: {
        workspaceId: ids.workspaceId,
        supplierId: po.supplierId,
        purchaseOrderId: po.id,
        grnNumber: `GRN-VQA-${name}-${randomUUID().slice(0, 8)}`,
        receiptDate: new Date(),
        status: "ACTIVE",
        totalAmount,
        items: { create: items }
      },
      include: { items: true }
    });

    for (const item of items) {
      await prisma.purchaseOrderItem.update({
        where: { id: item.purchaseOrderItemId },
        data: { receivedQuantity: { increment: item.acceptedQuantity } }
      });
    }

    for (const item of items) {
      await prisma.inventoryTransaction.create({
        data: {
          workspaceId: ids.workspaceId,
          productId: item.productId,
          type: "PURCHASE_RECEIPT",
          quantityChanged: item.acceptedQuantity,
          unitCost: decimal(item.totalCost).div(item.acceptedQuantity),
          reference: grn.grnNumber,
        }
      });
    }

    await prisma.ledgerEntry.create({
      data: {
        workspaceId: ids.workspaceId,
        supplierId: po.supplierId,
        type: "GOODS_RECEIVED",
        credit: totalAmount,
        description: `Goods received ${grn.grnNumber} (PO ${po.orderNumber})`,
        referenceId: grn.id,
      }
    });

    documentIds.grns[name] = grn.id;
    return grn;
  }

  const basicPO = await prisma.purchaseOrder.findFirst({ where: { workspaceId: ids.workspaceId, orderNumber: { startsWith: "PO-VQA-basic" } }, include: { items: true } });
  if (basicPO) await createGRNScenario("basic", { po: basicPO });

  await createGRNScenario("weighted", { po: weightPO });

  await createGRNScenario("multi", { po: multiPO });

  console.log("GRNs created");

  // ===== SUPPLIER RETURN =====
  console.log("Creating supplier returns...");

  const grnForReturn = await prisma.goodReceivedNote.findFirst({ where: { workspaceId: ids.workspaceId, grnNumber: { startsWith: "GRN-VQA-basic" } }, include: { items: true } });
  if (grnForReturn) {
    const returnItems = grnForReturn.items.slice(0, 1).map(item => {
      const quantity = Math.floor(Number(item.acceptedQuantity) * 0.2);
      return {
        purchaseOrderItemId: item.purchaseOrderItemId,
        productId: item.productId,
        goodReceivedNoteItemId: item.id,
        quantity,
        unitCost: item.unitCost,
        totalCost: decimal(item.unitCost).mul(quantity),
        returnedWeightKg: item.ratePerKg ? Math.floor(Number(item.acceptedWeightKg) * 0.2) : null,
        ratePerKg: item.ratePerKg || null,
      };
    });
    const returnAmount = returnItems.reduce((sum, item) => sum.plus(item.totalCost), decimal(0));
    const supplierReturn = await prisma.supplierReturn.create({
      data: {
        workspaceId: ids.workspaceId,
        supplierId: grnForReturn.supplierId,
        purchaseOrderId: grnForReturn.purchaseOrderId,
        goodReceivedNoteId: grnForReturn.id,
        number: `SR-VQA-${randomUUID().slice(0, 8)}`,
        reason: "Quality inspection failure - dented packaging",
        totalAmount: returnAmount,
        status: "POSTED",
        items: {
          create: returnItems,
        }
      }
    });
    documentIds.supplierReturn = supplierReturn.id;
  }

  console.log("Supplier return created");

  // ===== PAYMENT RECEIPT =====
  console.log("Creating payment receipts...");

  const cashBank = await prisma.cashBankAccount.findUnique({ where: { id: ids.cashAccountId } });
  const paymentReceipt = await prisma.payment.findFirst({
    where: { workspaceId: ids.workspaceId, documentNumber: { startsWith: "RCPT-VQA-partial-paid" } },
  });
  if (!paymentReceipt) throw new Error("Partial-payment receipt was not generated.");
  documentIds.paymentReceipt = paymentReceipt.id;

  console.log("Payment receipt created");

  // ===== EXPENSE VOUCHER =====
  console.log("Creating expense vouchers...");

  if (!cashBank) throw new Error("Active cash/bank account not found.");
  const expense = await prisma.expense.create({
    data: {
      workspaceId: ids.workspaceId,
      expenseAccountId: ids.expenseAccountId,
      paymentAccountId: cashBank.accountId,
      voucherNumber: `EXP-VQA-${randomUUID().slice(0, 8)}`,
      expenseDate: new Date(),
      amount: new Prisma.Decimal(15000),
      payee: "Office Supplies Vendor",
      reference: "Monthly stationery order",
      notes: "Office supplies for Q1",
    }
  });
  documentIds.expenseVoucher = expense.id;

  console.log("Expense voucher created");

  // ===== REPORT DATA =====
  console.log("Generating report data...");

  const invoicesForStatement = await prisma.invoice.findMany({ where: { workspaceId: ids.workspaceId, customerId: ids.customer1Id, status: { not: "CANCELLED" } } });
  for (const inv of invoicesForStatement) {
    await prisma.ledgerEntry.upsert({
      where: { id: `ledger-${inv.id}` },
      create: {
        id: `ledger-${inv.id}`,
        workspaceId: ids.workspaceId,
        customerId: inv.customerId,
        type: "SALE",
        debit: inv.amount,
        description: `Invoice ${inv.invoiceNumber}`,
        referenceId: inv.id,
        date: inv.issuedAt,
      },
      update: {}
    });
  }

  const grnsForStatement = await prisma.goodReceivedNote.findMany({ where: { workspaceId: ids.workspaceId, supplierId: ids.supplier1Id }, take: 10 });
  for (const grn of grnsForStatement) {
    await prisma.ledgerEntry.upsert({
      where: { id: `ledger-grn-${grn.id}` },
      create: {
        id: `ledger-grn-${grn.id}`,
        workspaceId: ids.workspaceId,
        supplierId: grn.supplierId,
        type: "GOODS_RECEIVED",
        credit: grn.totalAmount,
        description: `GRN ${grn.grnNumber}`,
        referenceId: grn.id,
        date: grn.receiptDate,
      },
      update: {}
    });
  }

  const accounts = await prisma.account.findMany({
    where: { workspaceId: ids.workspaceId, systemCode: { in: ["ACCOUNTS_RECEIVABLE", "SALES_REVENUE", "COST_OF_GOODS_SOLD", "INVENTORY", "OFFICE_EXPENSE", "CASH_IN_HAND"] } },
  });
  const accountByCode = Object.fromEntries(accounts.map(account => [account.systemCode, account]));
  const requiredCodes = ["ACCOUNTS_RECEIVABLE", "SALES_REVENUE", "COST_OF_GOODS_SOLD", "INVENTORY", "OFFICE_EXPENSE", "CASH_IN_HAND"];
  for (const code of requiredCodes) {
    if (!accountByCode[code]) throw new Error(`Required account missing: ${code}`);
  }

  for (const invoice of invoicesForStatement) {
    const cogs = decimal(invoice.amount).mul(0.6);
    await prisma.generalLedgerEntry.createMany({ data: [
      { workspaceId: ids.workspaceId, accountId: accountByCode.ACCOUNTS_RECEIVABLE.id, sourceType: "SALE", sourceId: invoice.salesOrderId || invoice.id, documentNo: invoice.invoiceNumber, date: invoice.issuedAt, narration: `Sale to Acme Corporation - ${invoice.invoiceNumber}`, debit: invoice.amount, credit: 0 },
      { workspaceId: ids.workspaceId, accountId: accountByCode.SALES_REVENUE.id, sourceType: "SALE", sourceId: invoice.salesOrderId || invoice.id, documentNo: invoice.invoiceNumber, date: invoice.issuedAt, narration: `Sales revenue - ${invoice.invoiceNumber}`, debit: 0, credit: invoice.amount },
      { workspaceId: ids.workspaceId, accountId: accountByCode.COST_OF_GOODS_SOLD.id, sourceType: "SALE", sourceId: invoice.salesOrderId || invoice.id, documentNo: invoice.invoiceNumber, date: invoice.issuedAt, narration: `Cost of goods sold - ${invoice.invoiceNumber}`, debit: cogs, credit: 0 },
      { workspaceId: ids.workspaceId, accountId: accountByCode.INVENTORY.id, sourceType: "SALE", sourceId: invoice.salesOrderId || invoice.id, documentNo: invoice.invoiceNumber, date: invoice.issuedAt, narration: `Inventory issued - ${invoice.invoiceNumber}`, debit: 0, credit: cogs },
    ] });
  }

  await prisma.generalLedgerEntry.createMany({ data: [
    { workspaceId: ids.workspaceId, accountId: accountByCode.OFFICE_EXPENSE.id, sourceType: "EXPENSE", sourceId: expense.id, documentNo: expense.voucherNumber, date: expense.expenseDate, narration: expense.notes || "Office supplies", debit: expense.amount, credit: 0 },
    { workspaceId: ids.workspaceId, accountId: accountByCode.CASH_IN_HAND.id, sourceType: "EXPENSE", sourceId: expense.id, documentNo: expense.voucherNumber, date: expense.expenseDate, narration: expense.notes || "Office supplies", debit: 0, credit: expense.amount },
  ] });

  if (paymentReceipt) {
    await prisma.generalLedgerEntry.createMany({ data: [
      { workspaceId: ids.workspaceId, accountId: accountByCode.CASH_IN_HAND.id, sourceType: "RECEIPT", sourceId: paymentReceipt.id, documentNo: paymentReceipt.documentNumber, date: paymentReceipt.paymentDate, narration: paymentReceipt.reference || "Customer receipt", debit: paymentReceipt.amount, credit: 0 },
      { workspaceId: ids.workspaceId, accountId: accountByCode.ACCOUNTS_RECEIVABLE.id, sourceType: "RECEIPT", sourceId: paymentReceipt.id, documentNo: paymentReceipt.documentNumber, date: paymentReceipt.paymentDate, narration: paymentReceipt.reference || "Customer receipt", debit: 0, credit: paymentReceipt.amount },
    ] });
  }
  await prisma.cashBankAccount.update({ where: { id: ids.cashAccountId }, data: { currentBalance: 36500 } });

  console.log("Report data generated");

  documentIds.reports = {
    customerId: ids.customer1Id,
    supplierId: ids.supplier1Id,
    cashBankAccountId: cashBank.id,
    generalLedgerAccountId: accountByCode.SALES_REVENUE.id,
  };
  fs.writeFileSync(path.join(__dirname, "visual-qa-document-ids.json"), JSON.stringify(documentIds, null, 2));
  console.log("Document IDs saved to tests/visual-qa/visual-qa-document-ids.json");

  await prisma.$disconnect();
  console.log("\nAll visual QA documents created successfully!");
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
