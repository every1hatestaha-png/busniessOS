import "server-only";

import { AccountCategory, AccountNormalBalance, AccountSystemCode, Prisma } from "@prisma/client";
import { endOfDay, startOfMonth } from "date-fns";

import { calculateProfitLossTotals, calculateRunningBalance } from "@/lib/accounting-math";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import { cashBankAccountSchema, expenseSchema, ledgerReportSchema, profitLossSchema, type CashBankAccountInput, type ExpenseInput, type LedgerReportInput, type ProfitLossInput } from "@/lib/validation/accounting";

export class AccountingDomainError extends Error {}

type ServiceContext = { workspaceId: string; userId?: string };

const DEFAULT_ACCOUNTS: Array<{ code: string; name: string; category: AccountCategory; normalBalance: AccountNormalBalance; systemCode: AccountSystemCode }> = [
  { code: "1000", name: "Cash in Hand", category: "ASSET", normalBalance: "DEBIT", systemCode: "CASH_IN_HAND" },
  { code: "1010", name: "Bank", category: "ASSET", normalBalance: "DEBIT", systemCode: "BANK" },
  { code: "1100", name: "Accounts Receivable", category: "ASSET", normalBalance: "DEBIT", systemCode: "ACCOUNTS_RECEIVABLE" },
  { code: "1200", name: "Inventory", category: "ASSET", normalBalance: "DEBIT", systemCode: "INVENTORY" },
  { code: "2000", name: "Accounts Payable", category: "LIABILITY", normalBalance: "CREDIT", systemCode: "ACCOUNTS_PAYABLE" },
  { code: "2100", name: "Withholding Tax Payable", category: "LIABILITY", normalBalance: "CREDIT", systemCode: "WITHHOLDING_TAX_PAYABLE" },
  { code: "3000", name: "Owner Equity", category: "EQUITY", normalBalance: "CREDIT", systemCode: "OWNER_EQUITY" },
  { code: "4000", name: "Sales Revenue", category: "INCOME", normalBalance: "CREDIT", systemCode: "SALES_REVENUE" },
  { code: "4100", name: "Other Income", category: "INCOME", normalBalance: "CREDIT", systemCode: "OTHER_INCOME" },
  { code: "5000", name: "Cost of Goods Sold", category: "COST_OF_SALES", normalBalance: "DEBIT", systemCode: "COST_OF_GOODS_SOLD" },
  { code: "6100", name: "Salary Expense", category: "EXPENSE", normalBalance: "DEBIT", systemCode: "SALARY_EXPENSE" },
  { code: "6110", name: "Electricity Expense", category: "EXPENSE", normalBalance: "DEBIT", systemCode: "ELECTRICITY_EXPENSE" },
  { code: "6120", name: "Rent Expense", category: "EXPENSE", normalBalance: "DEBIT", systemCode: "RENT_EXPENSE" },
  { code: "6130", name: "Fuel Expense", category: "EXPENSE", normalBalance: "DEBIT", systemCode: "FUEL_EXPENSE" },
  { code: "6140", name: "Transport Expense", category: "EXPENSE", normalBalance: "DEBIT", systemCode: "TRANSPORT_EXPENSE" },
  { code: "6150", name: "Factory Expense", category: "EXPENSE", normalBalance: "DEBIT", systemCode: "FACTORY_EXPENSE" },
  { code: "6160", name: "Office Expense", category: "EXPENSE", normalBalance: "DEBIT", systemCode: "OFFICE_EXPENSE" },
  { code: "6170", name: "Repairs Expense", category: "EXPENSE", normalBalance: "DEBIT", systemCode: "REPAIRS_EXPENSE" },
  { code: "6190", name: "Other Operating Expense", category: "EXPENSE", normalBalance: "DEBIT", systemCode: "OTHER_OPERATING_EXPENSE" },
];

function amount(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
}

function normalizeRange(input: ProfitLossInput | LedgerReportInput) {
  const from = input.from ?? startOfMonth(new Date());
  const to = endOfDay(input.to ?? new Date());
  return { from, to };
}

export async function ensureDefaultAccounts(workspaceId: string, tx: Prisma.TransactionClient = db) {
  for (const account of DEFAULT_ACCOUNTS) {
    await tx.account.upsert({
      where: { workspaceId_systemCode: { workspaceId, systemCode: account.systemCode } },
      create: { workspaceId, ...account },
      update: { code: account.code, name: account.name, category: account.category, normalBalance: account.normalBalance, isActive: true },
    });
  }

  const cashAccount = await tx.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "CASH_IN_HAND" } } });
  await tx.cashBankAccount.upsert({
    where: { workspaceId_accountId: { workspaceId, accountId: cashAccount.id } },
    create: { workspaceId, accountId: cashAccount.id, name: cashAccount.name, openingBalance: 0, currentBalance: 0, isBank: false },
    update: {},
  });
}

async function getSystemAccounts(tx: Prisma.TransactionClient, workspaceId: string, codes: AccountSystemCode[]) {
  await ensureDefaultAccounts(workspaceId, tx);
  const accounts = await tx.account.findMany({ where: { workspaceId, systemCode: { in: codes } } });
  const byCode = new Map(accounts.map((account) => [account.systemCode, account]));
  return Object.fromEntries(codes.map((code) => {
    const account = byCode.get(code);
    if (!account) throw new AccountingDomainError(`Missing accounting system account: ${code}`);
    return [code, account];
  })) as Record<AccountSystemCode, (typeof accounts)[number]>;
}

async function postBalancedEntries(tx: Prisma.TransactionClient, entries: Prisma.GeneralLedgerEntryCreateManyInput[]) {
  const debit = entries.reduce((sum, entry) => sum.plus(new Prisma.Decimal(entry.debit?.toString() ?? 0)), new Prisma.Decimal(0));
  const credit = entries.reduce((sum, entry) => sum.plus(new Prisma.Decimal(entry.credit?.toString() ?? 0)), new Prisma.Decimal(0));
  if (!debit.equals(credit)) throw new AccountingDomainError("General Ledger posting is not balanced.");
  if (entries.length) await tx.generalLedgerEntry.createMany({ data: entries });
}

export async function postSaleToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; saleId: string; orderNumber: string; date: Date; revenue: Prisma.Decimal; costOfGoodsSold: Prisma.Decimal; cashReceived: Prisma.Decimal }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["ACCOUNTS_RECEIVABLE", "SALES_REVENUE", "COST_OF_GOODS_SOLD", "INVENTORY", "CASH_IN_HAND"]);
  const narration = `Sale ${params.orderNumber}`;
  const entries: Prisma.GeneralLedgerEntryCreateManyInput[] = [
    { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_RECEIVABLE.id, sourceType: "SALE", sourceId: params.saleId, documentNo: params.orderNumber, date: params.date, narration, debit: params.revenue, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.SALES_REVENUE.id, sourceType: "SALE", sourceId: params.saleId, documentNo: params.orderNumber, date: params.date, narration, debit: 0, credit: params.revenue },
  ];
  if (params.costOfGoodsSold.greaterThan(0)) {
    entries.push(
      { workspaceId: params.workspaceId, accountId: accounts.COST_OF_GOODS_SOLD.id, sourceType: "SALE", sourceId: params.saleId, documentNo: params.orderNumber, date: params.date, narration: `COGS ${params.orderNumber}`, debit: params.costOfGoodsSold, credit: 0 },
      { workspaceId: params.workspaceId, accountId: accounts.INVENTORY.id, sourceType: "SALE", sourceId: params.saleId, documentNo: params.orderNumber, date: params.date, narration: `Inventory issued ${params.orderNumber}`, debit: 0, credit: params.costOfGoodsSold },
    );
  }
  if (params.cashReceived.greaterThan(0)) {
    entries.push(
      { workspaceId: params.workspaceId, accountId: accounts.CASH_IN_HAND.id, sourceType: "RECEIPT", sourceId: params.saleId, documentNo: params.orderNumber, date: params.date, narration: `Cash received with ${params.orderNumber}`, debit: params.cashReceived, credit: 0 },
      { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_RECEIVABLE.id, sourceType: "RECEIPT", sourceId: params.saleId, documentNo: params.orderNumber, date: params.date, narration: `Cash received with ${params.orderNumber}`, debit: 0, credit: params.cashReceived },
    );
    await tx.cashBankAccount.updateMany({ where: { workspaceId: params.workspaceId, accountId: accounts.CASH_IN_HAND.id }, data: { currentBalance: { increment: params.cashReceived } } });
  }
  await postBalancedEntries(tx, entries);
}

export async function postPurchaseToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; purchaseId: string; orderNumber: string; date: Date; inventoryAmount: Prisma.Decimal; cashPaid: Prisma.Decimal }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["INVENTORY", "ACCOUNTS_PAYABLE", "CASH_IN_HAND"]);
  const narration = `Purchase ${params.orderNumber}`;
  const entries: Prisma.GeneralLedgerEntryCreateManyInput[] = [
    { workspaceId: params.workspaceId, accountId: accounts.INVENTORY.id, sourceType: "PURCHASE", sourceId: params.purchaseId, documentNo: params.orderNumber, date: params.date, narration, debit: params.inventoryAmount, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_PAYABLE.id, sourceType: "PURCHASE", sourceId: params.purchaseId, documentNo: params.orderNumber, date: params.date, narration, debit: 0, credit: params.inventoryAmount },
  ];
  if (params.cashPaid.greaterThan(0)) {
    entries.push(
      { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_PAYABLE.id, sourceType: "PAYMENT", sourceId: params.purchaseId, documentNo: params.orderNumber, date: params.date, narration: `Paid with ${params.orderNumber}`, debit: params.cashPaid, credit: 0 },
      { workspaceId: params.workspaceId, accountId: accounts.CASH_IN_HAND.id, sourceType: "PAYMENT", sourceId: params.purchaseId, documentNo: params.orderNumber, date: params.date, narration: `Paid with ${params.orderNumber}`, debit: 0, credit: params.cashPaid },
    );
    await tx.cashBankAccount.updateMany({ where: { workspaceId: params.workspaceId, accountId: accounts.CASH_IN_HAND.id }, data: { currentBalance: { decrement: params.cashPaid } } });
  }
  await postBalancedEntries(tx, entries);
}

export async function postCustomerPaymentToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; paymentId: string; documentNo: string; date: Date; amount: Prisma.Decimal }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["CASH_IN_HAND", "ACCOUNTS_RECEIVABLE"]);
  await postBalancedEntries(tx, [
    { workspaceId: params.workspaceId, accountId: accounts.CASH_IN_HAND.id, sourceType: "RECEIPT", sourceId: params.paymentId, documentNo: params.documentNo, date: params.date, narration: `Customer receipt ${params.documentNo}`, debit: params.amount, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_RECEIVABLE.id, sourceType: "RECEIPT", sourceId: params.paymentId, documentNo: params.documentNo, date: params.date, narration: `Customer receipt ${params.documentNo}`, debit: 0, credit: params.amount },
  ]);
  await tx.cashBankAccount.updateMany({ where: { workspaceId: params.workspaceId, accountId: accounts.CASH_IN_HAND.id }, data: { currentBalance: { increment: params.amount } } });
}

export async function postSupplierPaymentToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; paymentId: string; documentNo: string; date: Date; amount: Prisma.Decimal }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["ACCOUNTS_PAYABLE", "CASH_IN_HAND"]);
  await postBalancedEntries(tx, [
    { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_PAYABLE.id, sourceType: "PAYMENT", sourceId: params.paymentId, documentNo: params.documentNo, date: params.date, narration: `Supplier payment ${params.documentNo}`, debit: params.amount, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.CASH_IN_HAND.id, sourceType: "PAYMENT", sourceId: params.paymentId, documentNo: params.documentNo, date: params.date, narration: `Supplier payment ${params.documentNo}`, debit: 0, credit: params.amount },
  ]);
  await tx.cashBankAccount.updateMany({ where: { workspaceId: params.workspaceId, accountId: accounts.CASH_IN_HAND.id }, data: { currentBalance: { decrement: params.amount } } });
}

export async function postCustomerReturnToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; returnId: string; documentNo: string; date: Date; amount: Prisma.Decimal; inventoryCost?: Prisma.Decimal }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["SALES_REVENUE", "ACCOUNTS_RECEIVABLE", "INVENTORY", "COST_OF_GOODS_SOLD"]);
  const entries: Prisma.GeneralLedgerEntryCreateManyInput[] = [
    { workspaceId: params.workspaceId, accountId: accounts.SALES_REVENUE.id, sourceType: "CUSTOMER_RETURN", sourceId: params.returnId, documentNo: params.documentNo, date: params.date, narration: `Customer return ${params.documentNo}`, debit: params.amount, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_RECEIVABLE.id, sourceType: "CUSTOMER_RETURN", sourceId: params.returnId, documentNo: params.documentNo, date: params.date, narration: `Customer return ${params.documentNo}`, debit: 0, credit: params.amount },
  ];
  if (params.inventoryCost?.greaterThan(0)) {
    entries.push(
      { workspaceId: params.workspaceId, accountId: accounts.INVENTORY.id, sourceType: "CUSTOMER_RETURN", sourceId: params.returnId, documentNo: params.documentNo, date: params.date, narration: `Returned inventory ${params.documentNo}`, debit: params.inventoryCost, credit: 0 },
      { workspaceId: params.workspaceId, accountId: accounts.COST_OF_GOODS_SOLD.id, sourceType: "CUSTOMER_RETURN", sourceId: params.returnId, documentNo: params.documentNo, date: params.date, narration: `COGS reversal ${params.documentNo}`, debit: 0, credit: params.inventoryCost },
    );
  }
  await postBalancedEntries(tx, entries);
}

export async function postSupplierReturnToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; returnId: string; documentNo: string; date: Date; amount: Prisma.Decimal }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["ACCOUNTS_PAYABLE", "INVENTORY"]);
  await postBalancedEntries(tx, [
    { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_PAYABLE.id, sourceType: "SUPPLIER_RETURN", sourceId: params.returnId, documentNo: params.documentNo, date: params.date, narration: `Supplier return ${params.documentNo}`, debit: params.amount, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.INVENTORY.id, sourceType: "SUPPLIER_RETURN", sourceId: params.returnId, documentNo: params.documentNo, date: params.date, narration: `Supplier return ${params.documentNo}`, debit: 0, credit: params.amount },
  ]);
}

export async function getChartOfAccounts(workspaceId: string) {
  await ensureDefaultAccounts(workspaceId);
  const accounts = await db.account.findMany({ where: { workspaceId }, orderBy: [{ code: "asc" }] });
  return accounts.map((account) => ({ id: account.id, code: account.code, name: account.name, category: account.category, normalBalance: account.normalBalance, systemCode: account.systemCode, isActive: account.isActive }));
}

export async function getCashBankAccounts(workspaceId: string) {
  await ensureDefaultAccounts(workspaceId);
  const rows = await db.cashBankAccount.findMany({ where: { workspaceId, isActive: true }, include: { account: true }, orderBy: { name: "asc" } });
  return rows.map((row) => ({ id: row.account.id, cashBankAccountId: row.id, name: row.name, code: row.account.code, isBank: row.isBank, bankName: row.bankName, accountNumber: row.accountNumber, openingBalance: amount(row.openingBalance), currentBalance: amount(row.currentBalance) }));
}

export async function createCashBankAccount(context: ServiceContext, input: CashBankAccountInput) {
  const data = cashBankAccountSchema.parse(input);
  return db.$transaction(async (tx) => {
    await ensureDefaultAccounts(context.workspaceId, tx);
    const count = await tx.cashBankAccount.count({ where: { workspaceId: context.workspaceId, isBank: data.isBank } });
    const code = data.isBank ? `10${20 + count}` : `10${10 + count}`;
    const account = await tx.account.create({ data: { workspaceId: context.workspaceId, code, name: data.name, category: "ASSET", normalBalance: "DEBIT", isActive: true } });
    await tx.cashBankAccount.create({ data: { workspaceId: context.workspaceId, accountId: account.id, name: data.name, openingBalance: data.openingBalance, currentBalance: data.openingBalance, isBank: data.isBank, bankName: data.bankName || null, accountNumber: data.accountNumber || null } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "cash_bank_account.created", entityType: "Account", entityId: account.id, metadata: { name: data.name, openingBalance: String(data.openingBalance) } });
    return { id: account.id };
  });
}

export async function createExpense(context: ServiceContext, input: ExpenseInput) {
  const data = expenseSchema.parse(input);
  const expenseAmount = new Prisma.Decimal(data.amount);
  return db.$transaction(async (tx) => {
    await ensureDefaultAccounts(context.workspaceId, tx);
    if (data.idempotencyKey) {
      const existing = await tx.expense.findFirst({ where: { workspaceId: context.workspaceId, idempotencyKey: data.idempotencyKey }, select: { id: true } });
      if (existing) return existing;
    }
    const [expenseAccount, paymentAccount, cashBank] = await Promise.all([
      tx.account.findFirst({ where: { id: data.expenseAccountId, workspaceId: context.workspaceId, category: "EXPENSE", isActive: true } }),
      tx.account.findFirst({ where: { id: data.paymentAccountId, workspaceId: context.workspaceId, category: "ASSET", isActive: true } }),
      tx.cashBankAccount.findUnique({ where: { workspaceId_accountId: { workspaceId: context.workspaceId, accountId: data.paymentAccountId } } }),
    ]);
    if (!expenseAccount) throw new AccountingDomainError("Expense account is unavailable.");
    if (!paymentAccount || !cashBank) throw new AccountingDomainError("Payment account must be an active cash/bank account.");
    const voucherNumber = await nextDocumentNumber(tx, context.workspaceId, "EXPENSE_VOUCHER");
    const expense = await tx.expense.create({ data: { workspaceId: context.workspaceId, expenseAccountId: expenseAccount.id, paymentAccountId: paymentAccount.id, voucherNumber, expenseDate: data.expenseDate, amount: expenseAmount, payee: data.payee || null, reference: data.reference || null, notes: data.notes || null, idempotencyKey: data.idempotencyKey || null, createdById: context.userId } });
    const narration = data.notes || `${expenseAccount.name}${data.payee ? ` paid to ${data.payee}` : ""}`;
    await tx.generalLedgerEntry.createMany({ data: [
      { workspaceId: context.workspaceId, accountId: expenseAccount.id, sourceType: "EXPENSE", sourceId: expense.id, documentNo: voucherNumber, date: data.expenseDate, narration, debit: expenseAmount, credit: 0 },
      { workspaceId: context.workspaceId, accountId: paymentAccount.id, sourceType: "EXPENSE", sourceId: expense.id, documentNo: voucherNumber, date: data.expenseDate, narration, debit: 0, credit: expenseAmount },
    ] });
    await tx.cashBankAccount.update({ where: { id: cashBank.id }, data: { currentBalance: { decrement: expenseAmount } } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "expense.created", entityType: "Expense", entityId: expense.id, metadata: { voucherNumber, amount: expenseAmount.toString() } });
    return { id: expense.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function getGeneralLedger(workspaceId: string, input: LedgerReportInput) {
  const data = ledgerReportSchema.parse(input);
  const { from, to } = normalizeRange(data);
  await ensureDefaultAccounts(workspaceId);
  const account = await db.account.findFirst({ where: { id: data.accountId, workspaceId } });
  if (!account) throw new AccountingDomainError("Account not found.");
  const [opening, entries] = await Promise.all([
    db.generalLedgerEntry.aggregate({ where: { workspaceId, accountId: account.id, date: { lt: from } }, _sum: { debit: true, credit: true } }),
    db.generalLedgerEntry.findMany({ where: { workspaceId, accountId: account.id, date: { gte: from, lte: to } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
  ]);
  const openingBalance = account.normalBalance === "DEBIT" ? amount(opening._sum.debit) - amount(opening._sum.credit) : amount(opening._sum.credit) - amount(opening._sum.debit);
  const rows = calculateRunningBalance(openingBalance, account.normalBalance, entries.map((entry) => ({ debit: amount(entry.debit), credit: amount(entry.credit) }))).map((entry, index) => ({ id: entries[index].id, date: entries[index].date.toISOString(), sourceType: entries[index].sourceType, documentNo: entries[index].documentNo, narration: entries[index].narration, debit: entry.debit, credit: entry.credit, runningBalance: entry.runningBalance }));
  return { account: { id: account.id, code: account.code, name: account.name, category: account.category, normalBalance: account.normalBalance }, from: from.toISOString(), to: to.toISOString(), openingBalance, entries: rows, closingBalance: rows.at(-1)?.runningBalance ?? openingBalance };
}

export async function getProfitAndLoss(workspaceId: string, input: ProfitLossInput = {}) {
  const data = profitLossSchema.parse(input);
  const { from, to } = normalizeRange(data);
  const [sales, returns, cogs, expenses] = await Promise.all([
    db.salesOrder.aggregate({ where: { workspaceId, status: { not: "CANCELLED" }, orderDate: { gte: from, lte: to } }, _sum: { total: true } }),
    db.customerReturn.aggregate({ where: { workspaceId, date: { gte: from, lte: to } }, _sum: { totalAmount: true } }),
    db.inventoryTransaction.findMany({ where: { workspaceId, type: "SALE", createdAt: { gte: from, lte: to } }, select: { quantityChanged: true, unitCost: true } }),
    db.expense.aggregate({ where: { workspaceId, expenseDate: { gte: from, lte: to } }, _sum: { amount: true } }),
  ]);
  const costOfGoodsSold = cogs.reduce((sum, row) => sum + Math.abs(row.quantityChanged) * amount(row.unitCost), 0);
  const operatingExpenses = amount(expenses._sum.amount);
  const totals = calculateProfitLossTotals({ grossSales: amount(sales._sum.total), salesReturns: amount(returns._sum.totalAmount), costOfGoodsSold, operatingExpenses });
  return { from: from.toISOString(), to: to.toISOString(), ...totals, costingMethod: "Historical sale-time product cost snapshot from InventoryTransaction.unitCost. Existing customer returns before this accounting phase do not carry enough COGS reversal data for precise returned-COGS adjustment." };
}

export async function getFinancialDashboard(workspaceId: string) {
  const [receivables, payables, inventory, cashBank, salesMonth, purchasesMonth, expensesMonth, lowStock, profitLoss] = await Promise.all([
    db.customer.aggregate({ where: { workspaceId }, _sum: { currentBalance: true } }),
    db.supplier.aggregate({ where: { workspaceId }, _sum: { currentBalance: true } }),
    db.product.findMany({ where: { workspaceId }, select: { stockQuantity: true, costPrice: true, reorderLevel: true } }),
    db.cashBankAccount.aggregate({ where: { workspaceId, isActive: true }, _sum: { currentBalance: true } }),
    db.salesOrder.aggregate({ where: { workspaceId, status: { not: "CANCELLED" }, orderDate: { gte: startOfMonth(new Date()) } }, _sum: { total: true } }),
    db.purchaseOrder.aggregate({ where: { workspaceId, status: { not: "CANCELLED" }, orderDate: { gte: startOfMonth(new Date()) } }, _sum: { totalAmount: true } }),
    db.expense.aggregate({ where: { workspaceId, expenseDate: { gte: startOfMonth(new Date()) } }, _sum: { amount: true } }),
    db.product.count({ where: { workspaceId, stockQuantity: { lte: db.product.fields.reorderLevel } } }),
    getProfitAndLoss(workspaceId),
  ]);
  const inventoryValue = inventory.reduce((sum, product) => sum + product.stockQuantity * amount(product.costPrice), 0);
  const receivableAmount = amount(receivables._sum.currentBalance);
  const payableAmount = amount(payables._sum.currentBalance);
  const cashBankAmount = amount(cashBank._sum.currentBalance);
  return { receivables: receivableAmount, payables: payableAmount, inventoryValue, cashBank: cashBankAmount, salesThisMonth: amount(salesMonth._sum.total), purchasesThisMonth: amount(purchasesMonth._sum.totalAmount), expensesThisMonth: amount(expensesMonth._sum.amount), grossProfit: profitLoss.grossProfit, netProfit: profitLoss.netProfit, lowStockCount: lowStock, netOperatingPosition: receivableAmount + inventoryValue + cashBankAmount - payableAmount };
}
