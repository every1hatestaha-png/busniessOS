import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let getReceivablesAging: typeof import("@/lib/server/receivables")["getReceivablesAging"];
let getGeneralLedger: typeof import("@/lib/server/accounting")["getGeneralLedger"];
let getProfitAndLoss: typeof import("@/lib/server/accounting")["getProfitAndLoss"];
let getFinancialDashboard: typeof import("@/lib/server/accounting")["getFinancialDashboard"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let getCustomerStatement: typeof import("@/lib/server/reports")["getCustomerStatement"];
let getSupplierStatement: typeof import("@/lib/server/reports")["getSupplierStatement"];
let getCurrentStockReport: typeof import("@/lib/server/reports")["getCurrentStockReport"];
let getStockMovementReport: typeof import("@/lib/server/reports")["getStockMovementReport"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let customerId = "";
let supplierId = "";
let productId = "";

const date = (value: string) => new Date(`${value}T12:00:00.000Z`);

describe("reports center integration", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv"); config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ getReceivablesAging } = await import("@/lib/server/receivables"));
    ({ getGeneralLedger, getProfitAndLoss, getFinancialDashboard, ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ getCustomerStatement, getSupplierStatement, getCurrentStockReport, getStockMovementReport } = await import("@/lib/server/reports"));

    const user = await db.user.create({ data: { clerkId: `reports-${runId}`, email: `reports-${runId}@example.invalid` } });
    userId = user.id;
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: `Reports ${runId}`, members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `Reports Other ${runId}`, members: { create: { userId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;
    const [customer, supplier, product] = await Promise.all([
      db.customer.create({ data: { workspaceId, name: "Report Customer", currentBalance: 365 } }),
      db.supplier.create({ data: { workspaceId, name: "Report Supplier", currentBalance: 80 } }),
      db.product.create({ data: { workspaceId, name: "Report Product", sku: `report-${runId}`, stockQuantity: 10, costPrice: 12, sellingPrice: 25, reorderLevel: 3 } }),
    ]);
    customerId = customer.id;
    supplierId = supplier.id;
    productId = product.id;
    await ensureDefaultAccounts(workspaceId);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    const ids = [workspaceId, otherWorkspaceId].filter(Boolean);
    await db.customerCreditAllocation.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.paymentAllocation.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.expense.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.payment.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.creditNote.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.invoice.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId: { in: ids } } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId: { in: ids } } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId: { in: ids } } } });
    await db.salesOrder.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.account.deleteMany({ where: { workspaceId: { in: ids } } });
    await db.workspace.deleteMany({ where: { id: { in: ids } } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("ages current, 1-30, 31-45, 46-60, and 61+ invoices with settlements and isolation", async () => {
    const asOf = date("2026-08-30");
    const invoiceData = [
      ["INV-CURRENT", "2026-08-30", 100],
      ["INV-10", "2026-08-20", 100],
      ["INV-35", "2026-07-26", 100],
      ["INV-50", "2026-07-11", 100],
      ["INV-70", "2026-06-21", 100],
    ] as const;
    const invoices = [];
    for (const [invoiceNumber, dueDate, amount] of invoiceData) {
      invoices.push(await db.invoice.create({ data: { workspaceId, customerId, invoiceNumber: `${invoiceNumber}-${runId}`, status: "UNPAID", amount, issuedAt: date(dueDate) } }));
    }
    const partial = invoices[1];
    await db.payment.create({ data: { workspaceId, customerId, invoiceId: partial.id, amount: 20, paymentDate: date("2026-08-25") } });
    const credit = await db.creditNote.create({ data: { workspaceId, customerId, number: `CN-${runId}`, reason: "Report test credit", amount: 10, appliedAmount: 10, remainingAmount: 0, status: "APPLIED", date: date("2026-08-25") } });
    await db.customerCreditAllocation.create({ data: { workspaceId, creditNoteId: credit.id, invoiceId: partial.id, amount: 10, createdAt: date("2026-08-25") } });
    const settled = await db.invoice.create({ data: { workspaceId, customerId, invoiceNumber: `INV-SETTLED-${runId}`, status: "PAID", amount: 50, paidAmount: 50, issuedAt: date("2026-08-01"), dueDate: date("2026-08-01") } });
    await db.payment.create({ data: { workspaceId, customerId, invoiceId: settled.id, amount: 50, paymentDate: date("2026-08-10") } });
    await db.invoice.create({ data: { workspaceId, customerId, invoiceNumber: `INV-CANCELLED-${runId}`, status: "CANCELLED", amount: 999, issuedAt: date("2026-06-01") } });
    const otherCustomer = await db.customer.create({ data: { workspaceId: otherWorkspaceId, name: "Other Report Customer" } });
    await db.invoice.create({ data: { workspaceId: otherWorkspaceId, customerId: otherCustomer.id, invoiceNumber: `INV-OTHER-${runId}`, status: "UNPAID", amount: 999, issuedAt: date("2026-06-01") } });

    const report = await getReceivablesAging(workspaceId, { asOf, timeZone: "Asia/Karachi" });
    expect(report.buckets).toMatchObject({ current: 100, "1-30": 70, "31-45": 100, "46-60": 100, "61+": 100 });
    expect(report.totalOutstanding).toBe(470);
    expect(report.customers.flatMap((row) => row.items).find((item) => item.invoiceId === partial.id)).toMatchObject({ paymentsApplied: 20, creditsApplied: 10, outstandingAmount: 70 });
    expect(report.customers.flatMap((row) => row.items).some((item) => item.invoiceId === settled.id)).toBe(false);
    expect(report.customers.every((row) => row.customerId === customerId)).toBe(true);
  }, 60_000);

  it("calculates GL opening, running, closing, date filters, and search from persisted entries", async () => {
    const account = await db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "ACCOUNTS_RECEIVABLE" } } });
    await db.generalLedgerEntry.createMany({ data: [
      { workspaceId, accountId: account.id, sourceType: "ADJUSTMENT", sourceId: randomUUID(), documentNo: `OPEN-${runId}`, date: date("2026-07-31"), narration: "Opening report balance", debit: 50, credit: 0 },
      { workspaceId, accountId: account.id, sourceType: "SALE", sourceId: randomUUID(), documentNo: `INV-GL-${runId}`, date: date("2026-08-10"), narration: "Target customer invoice", debit: 100, credit: 0 },
      { workspaceId, accountId: account.id, sourceType: "RECEIPT", sourceId: randomUUID(), documentNo: `RCPT-${runId}`, date: date("2026-08-15"), narration: "Customer receipt", debit: 0, credit: 30 },
    ] });
    const report = await getGeneralLedger(workspaceId, { accountId: account.id, from: date("2026-08-01"), to: date("2026-08-31"), search: "customer" });
    expect(report.openingBalance).toBe(50);
    expect(report.entries).toHaveLength(2);
    expect(report.entries.map((entry) => entry.runningBalance)).toEqual([150, 120]);
    expect(report.closingBalance).toBe(120);
  }, 60_000);

  it("reports revenue, historical COGS, expenses, gross profit, and net profit by date", async () => {
    await db.salesOrder.create({ data: { workspaceId, customerId, orderNumber: `SO-PNL-${runId}`, status: "CONFIRMED", subtotal: 200, total: 200, balanceAmount: 200, orderDate: date("2026-08-05") } });
    await db.salesOrder.create({ data: { workspaceId, customerId, orderNumber: `SO-CANCEL-PNL-${runId}`, status: "CANCELLED", subtotal: 500, total: 500, orderDate: date("2026-08-06") } });
    await db.inventoryTransaction.createMany({ data: [
      { workspaceId, productId, type: "SALE", quantityChanged: -2, unitCost: 30, reference: `SO-PNL-${runId}`, createdAt: date("2026-08-05") },
      { workspaceId, productId, type: "SALE", quantityChanged: -5, unitCost: 40, reference: `SO-CANCEL-PNL-${runId}`, createdAt: date("2026-08-06") },
    ] });
    const expenseAccount = await db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "OFFICE_EXPENSE" } } });
    const cashAccount = await db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "CASH_IN_HAND" } } });
    const cogsAccount = await db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "COST_OF_GOODS_SOLD" } } });
    await db.expense.create({ data: { workspaceId, expenseAccountId: expenseAccount.id, paymentAccountId: cashAccount.id, voucherNumber: `EXP-PNL-${runId}`, expenseDate: date("2026-08-07"), amount: 25 } });
    await db.generalLedgerEntry.createMany({ data: [
      { workspaceId, accountId: cogsAccount.id, sourceType: "SALE", sourceId: randomUUID(), documentNo: `SO-PNL-${runId}`, date: date("2026-08-05"), narration: "Historical COGS", debit: 60, credit: 0 },
      { workspaceId, accountId: expenseAccount.id, sourceType: "EXPENSE", sourceId: randomUUID(), documentNo: `EXP-PNL-${runId}`, date: date("2026-08-07"), narration: "Office expense", debit: 25, credit: 0 },
    ] });
    const report = await getProfitAndLoss(workspaceId, { from: date("2026-08-01"), to: date("2026-08-31") });
    expect(report).toMatchObject({ grossSales: 200, costOfGoodsSold: 60, grossProfit: 140, operatingExpenses: 25, netProfit: 115 });
    expect(report.expenseCategories).toEqual([expect.objectContaining({ name: "Office Expense", amount: 25 })]);
  }, 60_000);

  it("builds customer and supplier statements with opening and running balances", async () => {
    await db.ledgerEntry.createMany({ data: [
      { workspaceId, customerId, type: "OPENING_BALANCE", debit: 40, date: date("2026-07-31"), description: "Customer opening" },
      { workspaceId, customerId, type: "SALE", debit: 100, date: date("2026-08-02"), description: "Customer sale" },
      { workspaceId, customerId, type: "PAYMENT_RECEIVED", credit: 30, date: date("2026-08-03"), description: "Customer payment" },
      { workspaceId, supplierId, type: "OPENING_BALANCE", credit: 20, date: date("2026-07-31"), description: "Supplier opening" },
      { workspaceId, supplierId, type: "GOODS_RECEIVED", credit: 80, date: date("2026-08-02"), description: "Supplier GRN" },
      { workspaceId, supplierId, type: "PAYMENT_MADE", debit: 25, date: date("2026-08-03"), description: "Supplier payment" },
    ] });
    const [customer, supplier] = await Promise.all([
      getCustomerStatement(workspaceId, customerId, { from: date("2026-08-01"), to: date("2026-08-31") }),
      getSupplierStatement(workspaceId, supplierId, { from: date("2026-08-01"), to: date("2026-08-31") }),
    ]);
    expect(customer).toMatchObject({ openingBalance: 40, closingBalance: 110 });
    expect(customer?.entries.map((entry) => entry.runningBalance)).toEqual([140, 110]);
    expect(supplier).toMatchObject({ openingBalance: 20, closingBalance: 75 });
    expect(supplier?.entries.map((entry) => entry.runningBalance)).toEqual([100, 75]);
    const searched = await getCustomerStatement(workspaceId, customerId, { from: date("2026-08-01"), to: date("2026-08-31"), search: "customer sale" });
    expect(searched).toMatchObject({ openingBalance: 40, closingBalance: 110 });
    expect(searched?.entries).toHaveLength(1);
    expect(searched?.entries[0].runningBalance).toBe(140);
  }, 60_000);

  it("reports current-cost stock valuation and persisted movement running quantity", async () => {
    const movementProduct = await db.product.create({ data: { workspaceId, name: "Movement Report Product", sku: `movement-${runId}`, stockQuantity: 10, costPrice: 12, sellingPrice: 20, reorderLevel: 2 } });
    await db.inventoryTransaction.createMany({ data: [
      { workspaceId, productId: movementProduct.id, type: "OPENING_STOCK", quantityChanged: 5, unitCost: 10, reference: "Opening", createdAt: date("2026-07-31") },
      { workspaceId, productId: movementProduct.id, type: "PURCHASE_RECEIPT", quantityChanged: 8, unitCost: 12, reference: "GRN-REPORT", createdAt: date("2026-08-02") },
      { workspaceId, productId: movementProduct.id, type: "SALE", quantityChanged: -3, unitCost: 12, reference: "SO-REPORT", createdAt: date("2026-08-03") },
    ] });
    const inventoryAccount = await db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "INVENTORY" } } });
    await db.generalLedgerEntry.create({ data: { workspaceId, accountId: inventoryAccount.id, sourceType: "ADJUSTMENT", sourceId: randomUUID(), documentNo: `INV-VAL-${runId}`, date: date("2026-08-03"), narration: "Inventory valuation test", debit: 240, credit: 0 } });
    const [stock, movement] = await Promise.all([
      getCurrentStockReport(workspaceId),
      getStockMovementReport(workspaceId, { from: date("2026-08-01"), to: date("2026-08-31"), productId: movementProduct.id }),
    ]);
    expect(stock).toMatchObject({ totalQuantity: 20, totalValue: 240, inventoryGlBalance: 240, reconciliationDifference: 0 });
    expect(stock.rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: movementProduct.id, unitCost: 12, stockValue: 120 })]));
    expect(movement.rows.map((row) => [row.quantityIn, row.quantityOut, row.runningQuantity])).toEqual([[8, 0, 13], [0, 3, 10]]);
  }, 60_000);

  it("uses report totals once in the Net Operating Position formula", async () => {
    const dashboard = await getFinancialDashboard(workspaceId);
    expect(dashboard.netOperatingPosition).toBe(dashboard.receivables + dashboard.inventoryValue + dashboard.cashBank - dashboard.payables);
  }, 60_000);
});
