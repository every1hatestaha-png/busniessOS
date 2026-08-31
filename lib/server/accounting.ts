import "server-only";

import { AccountCategory, AccountNormalBalance, AccountSystemCode, Prisma, type GeneralLedgerSourceType } from "@prisma/client";
import { calculateProfitLossTotals, calculateRunningBalance } from "@/lib/accounting-math";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import { getPayablesSummary } from "@/lib/server/payables";
import { getReceivablesAging } from "@/lib/server/receivables";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { businessDayEnd, businessDayStart, businessMonthStart } from "@/lib/server/business-time";
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
  const now = new Date();
  const from = input.from ? businessDayStart(input.from) : businessMonthStart(now);
  const to = businessDayEnd(input.to ?? now);
  return { from, to };
}

const bootstrappedWorkspaces = new Set<string>();

export async function ensureDefaultAccounts(workspaceId: string, tx: Prisma.TransactionClient = db) {
  const canUseCache = tx === db;
  if (canUseCache && bootstrappedWorkspaces.has(workspaceId)) return;

  const existingDefaults = await tx.account.count({ where: { workspaceId, systemCode: { in: DEFAULT_ACCOUNTS.map((account) => account.systemCode) } } });
  if (existingDefaults < DEFAULT_ACCOUNTS.length) {
    for (const account of DEFAULT_ACCOUNTS) {
      await tx.account.upsert({
        where: { workspaceId_systemCode: { workspaceId, systemCode: account.systemCode } },
        create: { workspaceId, ...account },
        update: { code: account.code, name: account.name, category: account.category, normalBalance: account.normalBalance, isActive: true },
      });
    }
  }

  const cashAccount = await tx.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "CASH_IN_HAND" } } });
  await tx.cashBankAccount.upsert({
    where: { workspaceId_accountId: { workspaceId, accountId: cashAccount.id } },
    create: { workspaceId, accountId: cashAccount.id, name: cashAccount.name, openingBalance: 0, currentBalance: 0, isBank: false },
    update: {},
  });

  if (canUseCache) bootstrappedWorkspaces.add(workspaceId);
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

async function getDefaultCashBankAccount(tx: Prisma.TransactionClient, workspaceId: string) {
  await ensureDefaultAccounts(workspaceId, tx);
  const cash = await tx.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "CASH_IN_HAND" } } });
  const cashBank = await tx.cashBankAccount.findUniqueOrThrow({ where: { workspaceId_accountId: { workspaceId, accountId: cash.id } }, include: { account: true } });
  return cashBank;
}

async function resolveCashBankAccount(tx: Prisma.TransactionClient, workspaceId: string, cashBankAccountId?: string | null) {
  if (!cashBankAccountId) return getDefaultCashBankAccount(tx, workspaceId);
  const cashBank = await tx.cashBankAccount.findFirst({ where: { id: cashBankAccountId, workspaceId, isActive: true }, include: { account: true } });
  if (!cashBank) throw new AccountingDomainError("Cash/bank account is unavailable.");
  return cashBank;
}

async function postBalancedEntries(tx: Prisma.TransactionClient, entries: Prisma.GeneralLedgerEntryCreateManyInput[]) {
  const debit = entries.reduce((sum, entry) => sum.plus(new Prisma.Decimal(entry.debit?.toString() ?? 0)), new Prisma.Decimal(0));
  const credit = entries.reduce((sum, entry) => sum.plus(new Prisma.Decimal(entry.credit?.toString() ?? 0)), new Prisma.Decimal(0));
  if (!debit.equals(credit)) throw new AccountingDomainError("General Ledger posting is not balanced.");
  if (entries.length) await tx.generalLedgerEntry.createMany({ data: entries });
}

export async function reverseGeneralLedgerEntries(tx: Prisma.TransactionClient, params: { workspaceId: string; sources: Array<{ sourceType: GeneralLedgerSourceType; sourceId: string }>; documentNo: string; date: Date; reason: string; reversedById?: string | null }) {
  if (!params.sources.length) return { reversed: 0 };
  const originals = await tx.generalLedgerEntry.findMany({
    where: {
      workspaceId: params.workspaceId,
      reversalOfId: null,
      OR: params.sources.map((source) => ({ sourceType: source.sourceType, sourceId: source.sourceId })),
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  if (!originals.length) return { reversed: 0 };

  const existing = await tx.generalLedgerEntry.findMany({
    where: { workspaceId: params.workspaceId, reversalOfId: { in: originals.map((entry) => entry.id) } },
    select: { reversalOfId: true },
  });
  const alreadyReversed = new Set(existing.map((entry) => entry.reversalOfId).filter(Boolean));
  const entries = originals
    .filter((entry) => !alreadyReversed.has(entry.id))
    .map((entry) => ({
      workspaceId: entry.workspaceId,
      accountId: entry.accountId,
      sourceType: "REVERSAL" as const,
      sourceId: entry.sourceId,
      documentNo: params.documentNo,
      date: params.date,
      narration: `${params.reason}: ${entry.narration}`,
      debit: entry.credit,
      credit: entry.debit,
      reversalOfId: entry.id,
      reversedAt: params.date,
      reversedById: params.reversedById ?? null,
      reversalReason: params.reason,
    }));

  await postBalancedEntries(tx, entries);
  return { reversed: entries.length };
}

export async function postSaleToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; saleId: string; orderNumber: string; date: Date; revenue: Prisma.Decimal; costOfGoodsSold: Prisma.Decimal; cashReceived: Prisma.Decimal; cashBankAccountId?: string | null }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["ACCOUNTS_RECEIVABLE", "SALES_REVENUE", "COST_OF_GOODS_SOLD", "INVENTORY"]);
  const cashBank = params.cashReceived.greaterThan(0) ? await resolveCashBankAccount(tx, params.workspaceId, params.cashBankAccountId) : null;
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
      { workspaceId: params.workspaceId, accountId: cashBank!.accountId, sourceType: "RECEIPT", sourceId: params.saleId, documentNo: params.orderNumber, date: params.date, narration: `Cash received with ${params.orderNumber}`, debit: params.cashReceived, credit: 0 },
      { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_RECEIVABLE.id, sourceType: "RECEIPT", sourceId: params.saleId, documentNo: params.orderNumber, date: params.date, narration: `Cash received with ${params.orderNumber}`, debit: 0, credit: params.cashReceived },
    );
    await tx.cashBankAccount.update({ where: { id: cashBank!.id }, data: { currentBalance: { increment: params.cashReceived } } });
  }
  await postBalancedEntries(tx, entries);
}

export async function postPurchaseToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; purchaseId: string; orderNumber: string; date: Date; inventoryAmount: Prisma.Decimal; cashPaid: Prisma.Decimal; cashBankAccountId?: string | null }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["INVENTORY", "ACCOUNTS_PAYABLE"]);
  const cashBank = params.cashPaid.greaterThan(0) ? await resolveCashBankAccount(tx, params.workspaceId, params.cashBankAccountId) : null;
  const narration = `Purchase ${params.orderNumber}`;
  const entries: Prisma.GeneralLedgerEntryCreateManyInput[] = [
    { workspaceId: params.workspaceId, accountId: accounts.INVENTORY.id, sourceType: "PURCHASE", sourceId: params.purchaseId, documentNo: params.orderNumber, date: params.date, narration, debit: params.inventoryAmount, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_PAYABLE.id, sourceType: "PURCHASE", sourceId: params.purchaseId, documentNo: params.orderNumber, date: params.date, narration, debit: 0, credit: params.inventoryAmount },
  ];
  if (params.cashPaid.greaterThan(0)) {
    entries.push(
      { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_PAYABLE.id, sourceType: "PAYMENT", sourceId: params.purchaseId, documentNo: params.orderNumber, date: params.date, narration: `Paid with ${params.orderNumber}`, debit: params.cashPaid, credit: 0 },
      { workspaceId: params.workspaceId, accountId: cashBank!.accountId, sourceType: "PAYMENT", sourceId: params.purchaseId, documentNo: params.orderNumber, date: params.date, narration: `Paid with ${params.orderNumber}`, debit: 0, credit: params.cashPaid },
    );
    await tx.cashBankAccount.update({ where: { id: cashBank!.id }, data: { currentBalance: { decrement: params.cashPaid } } });
  }
  await postBalancedEntries(tx, entries);
}

export async function postCustomerPaymentToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; paymentId: string; documentNo: string; date: Date; amount: Prisma.Decimal; cashBankAccountId?: string | null }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["ACCOUNTS_RECEIVABLE"]);
  const cashBank = await resolveCashBankAccount(tx, params.workspaceId, params.cashBankAccountId);
  await postBalancedEntries(tx, [
    { workspaceId: params.workspaceId, accountId: cashBank.accountId, sourceType: "RECEIPT", sourceId: params.paymentId, documentNo: params.documentNo, date: params.date, narration: `Customer receipt ${params.documentNo}`, debit: params.amount, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_RECEIVABLE.id, sourceType: "RECEIPT", sourceId: params.paymentId, documentNo: params.documentNo, date: params.date, narration: `Customer receipt ${params.documentNo}`, debit: 0, credit: params.amount },
  ]);
  await tx.cashBankAccount.update({ where: { id: cashBank.id }, data: { currentBalance: { increment: params.amount } } });
}

export async function postSupplierPaymentToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; paymentId: string; documentNo: string; date: Date; amount: Prisma.Decimal; withholdingTaxAmount?: Prisma.Decimal; cashBankAccountId?: string | null }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["ACCOUNTS_PAYABLE", "WITHHOLDING_TAX_PAYABLE"]);
  const cashBank = await resolveCashBankAccount(tx, params.workspaceId, params.cashBankAccountId);
  const withholdingTaxAmount = params.withholdingTaxAmount ?? new Prisma.Decimal(0);
  const netAmount = params.amount.minus(withholdingTaxAmount);
  const entries: Prisma.GeneralLedgerEntryCreateManyInput[] = [
    { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_PAYABLE.id, sourceType: "PAYMENT", sourceId: params.paymentId, documentNo: params.documentNo, date: params.date, narration: `Supplier payment ${params.documentNo}`, debit: params.amount, credit: 0 },
  ];
  if (withholdingTaxAmount.greaterThan(0)) entries.push({ workspaceId: params.workspaceId, accountId: accounts.WITHHOLDING_TAX_PAYABLE.id, sourceType: "PAYMENT", sourceId: params.paymentId, documentNo: params.documentNo, date: params.date, narration: `WHT on ${params.documentNo}`, debit: 0, credit: withholdingTaxAmount });
  if (netAmount.greaterThan(0)) entries.push({ workspaceId: params.workspaceId, accountId: cashBank.accountId, sourceType: "PAYMENT", sourceId: params.paymentId, documentNo: params.documentNo, date: params.date, narration: `Supplier payment ${params.documentNo}`, debit: 0, credit: netAmount });
  await postBalancedEntries(tx, entries);
  if (netAmount.greaterThan(0)) await tx.cashBankAccount.update({ where: { id: cashBank.id }, data: { currentBalance: { decrement: netAmount } } });
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

export async function postGoodsReceiptToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; grnId: string; grnNumber: string; date: Date; inventoryAmount: Prisma.Decimal }) {
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["INVENTORY", "ACCOUNTS_PAYABLE"]);
  const narration = `Goods received ${params.grnNumber}`;
  await postBalancedEntries(tx, [
    { workspaceId: params.workspaceId, accountId: accounts.INVENTORY.id, sourceType: "PURCHASE_RECEIPT", sourceId: params.grnId, documentNo: params.grnNumber, date: params.date, narration, debit: params.inventoryAmount, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.ACCOUNTS_PAYABLE.id, sourceType: "PURCHASE_RECEIPT", sourceId: params.grnId, documentNo: params.grnNumber, date: params.date, narration, debit: 0, credit: params.inventoryAmount },
  ]);
}

export async function postOpeningAssetToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; sourceId: string; documentNo: string; date: Date; assetAccountId?: string; assetSystemCode?: "ACCOUNTS_RECEIVABLE" | "INVENTORY"; amount: Prisma.Decimal | number }) {
  const equity = await getSystemAccounts(tx, params.workspaceId, ["OWNER_EQUITY"]);
  const assetAccount = params.assetAccountId
    ? await tx.account.findFirst({ where: { id: params.assetAccountId, workspaceId: params.workspaceId, category: "ASSET" }, select: { id: true } })
    : (await getSystemAccounts(tx, params.workspaceId, [params.assetSystemCode!]))[params.assetSystemCode!];
  if (!assetAccount) throw new AccountingDomainError("Opening-balance asset account is unavailable.");
  await postBalancedEntries(tx, [
    { workspaceId: params.workspaceId, accountId: assetAccount.id, sourceType: "ADJUSTMENT", sourceId: params.sourceId, documentNo: params.documentNo, date: params.date, narration: `Opening balance ${params.documentNo}`, debit: params.amount, credit: 0 },
    { workspaceId: params.workspaceId, accountId: equity.OWNER_EQUITY.id, sourceType: "ADJUSTMENT", sourceId: params.sourceId, documentNo: params.documentNo, date: params.date, narration: `Opening balance ${params.documentNo}`, debit: 0, credit: params.amount },
  ]);
}

export async function postInventoryAdjustmentToGeneralLedger(tx: Prisma.TransactionClient, params: { workspaceId: string; sourceId: string; documentNo: string; date: Date; value: Prisma.Decimal }) {
  if (params.value.isZero()) return;
  const accounts = await getSystemAccounts(tx, params.workspaceId, ["INVENTORY", "OTHER_INCOME", "OTHER_OPERATING_EXPENSE"]);
  const gain = params.value.greaterThan(0);
  const value = params.value.abs();
  await postBalancedEntries(tx, gain ? [
    { workspaceId: params.workspaceId, accountId: accounts.INVENTORY.id, sourceType: "ADJUSTMENT", sourceId: params.sourceId, documentNo: params.documentNo, date: params.date, narration: `Inventory adjustment ${params.documentNo}`, debit: value, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.OTHER_INCOME.id, sourceType: "ADJUSTMENT", sourceId: params.sourceId, documentNo: params.documentNo, date: params.date, narration: `Inventory adjustment ${params.documentNo}`, debit: 0, credit: value },
  ] : [
    { workspaceId: params.workspaceId, accountId: accounts.OTHER_OPERATING_EXPENSE.id, sourceType: "ADJUSTMENT", sourceId: params.sourceId, documentNo: params.documentNo, date: params.date, narration: `Inventory adjustment ${params.documentNo}`, debit: value, credit: 0 },
    { workspaceId: params.workspaceId, accountId: accounts.INVENTORY.id, sourceType: "ADJUSTMENT", sourceId: params.sourceId, documentNo: params.documentNo, date: params.date, narration: `Inventory adjustment ${params.documentNo}`, debit: 0, credit: value },
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
  return rows.map((row) => ({ id: row.account.id, cashBankAccountId: row.id, name: row.name, code: row.account.code, isBank: row.isBank, bankName: row.bankName, accountTitle: row.accountTitle, accountNumber: row.accountNumber, notes: row.notes, openingBalance: amount(row.openingBalance), currentBalance: amount(row.currentBalance) }));
}

export async function getCashBankAccountLedger(workspaceId: string, cashBankAccountId: string, input: Omit<LedgerReportInput, "accountId"> = {}) {
  await ensureDefaultAccounts(workspaceId);
  const cashBank = await db.cashBankAccount.findFirst({ where: { id: cashBankAccountId, workspaceId, isActive: true }, include: { account: true } });
  if (!cashBank) return null;
  const ledger = await getGeneralLedger(workspaceId, { accountId: cashBank.accountId, ...input });
  const openingPosted = await db.generalLedgerEntry.count({ where: { workspaceId, sourceType: "ADJUSTMENT", sourceId: cashBank.accountId, documentNo: `OPEN-${cashBank.accountId.slice(0, 8).toUpperCase()}` } });
  const legacyOpening = openingPosted ? 0 : amount(cashBank.openingBalance);
  const openingBalance = legacyOpening + ledger.openingBalance;
  const entries = ledger.entries.map((entry) => ({ ...entry, runningBalance: entry.runningBalance + legacyOpening }));
  const receipts = entries.reduce((sum, entry) => sum + entry.debit, 0);
  const payments = entries.reduce((sum, entry) => sum + entry.credit, 0);
  const closingBalance = entries.at(-1)?.runningBalance ?? openingBalance;
  return {
    id: cashBank.id,
    accountId: cashBank.accountId,
    code: cashBank.account.code,
    name: cashBank.name,
    isBank: cashBank.isBank,
    bankName: cashBank.bankName,
    accountTitle: cashBank.accountTitle,
    accountNumber: cashBank.accountNumber,
    notes: cashBank.notes,
    from: ledger.from,
    to: ledger.to,
    openingBalance,
    currentBalance: amount(cashBank.currentBalance),
    receipts,
    payments,
    closingBalance,
    reconciliationDifference: amount(cashBank.currentBalance) - closingBalance,
    entries,
  };
}

export async function createCashBankAccount(context: ServiceContext, input: CashBankAccountInput) {
  const data = cashBankAccountSchema.parse(input);
  return db.$transaction(async (tx) => {
    await ensureDefaultAccounts(context.workspaceId, tx);
    const count = await tx.cashBankAccount.count({ where: { workspaceId: context.workspaceId, isBank: data.isBank } });
    const code = data.isBank ? `10${20 + count}` : `10${10 + count}`;
    const account = await tx.account.create({ data: { workspaceId: context.workspaceId, code, name: data.name, category: "ASSET", normalBalance: "DEBIT", isActive: true } });
    await tx.cashBankAccount.create({ data: { workspaceId: context.workspaceId, accountId: account.id, name: data.name, openingBalance: data.openingBalance, currentBalance: data.openingBalance, isBank: data.isBank, bankName: data.bankName || null, accountTitle: data.accountTitle || null, accountNumber: data.accountNumber || null, notes: data.notes || null } });
    if (data.openingBalance > 0) await postOpeningAssetToGeneralLedger(tx, { workspaceId: context.workspaceId, sourceId: account.id, documentNo: `OPEN-${account.id.slice(0, 8).toUpperCase()}`, date: new Date(), assetAccountId: account.id, amount: data.openingBalance });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "cash_bank_account.created", entityType: "Account", entityId: account.id, metadata: { name: data.name, openingBalance: String(data.openingBalance) } });
    return { id: account.id };
  });
}

export async function createExpense(context: ServiceContext, input: ExpenseInput) {
  const data = expenseSchema.parse(input);
  const expenseAmount = new Prisma.Decimal(data.amount);
  return withSerializableRetry(async (tx) => {
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
  });
}

export async function listExpenses(workspaceId: string) {
  const rows = await db.expense.findMany({ where: { workspaceId }, orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }], take: 500, include: { expenseAccount: { select: { name: true, code: true } }, paymentAccount: { select: { name: true, code: true } } } });
  return rows.map((row) => ({ id: row.id, voucherNumber: row.voucherNumber, date: row.expenseDate.toISOString(), amount: amount(row.amount), payee: row.payee, reference: row.reference, notes: row.notes, expenseAccount: row.expenseAccount, paymentAccount: row.paymentAccount }));
}

export async function getGeneralLedger(workspaceId: string, input: LedgerReportInput) {
  const data = ledgerReportSchema.parse(input);
  const { from, to } = normalizeRange(data);
  await ensureDefaultAccounts(workspaceId);
  const account = await db.account.findFirst({ where: { id: data.accountId, workspaceId } });
  if (!account) throw new AccountingDomainError("Account not found.");
  const [opening, entries] = await Promise.all([
    db.generalLedgerEntry.aggregate({ where: { workspaceId, accountId: account.id, date: { lt: from } }, _sum: { debit: true, credit: true } }),
    db.generalLedgerEntry.findMany({ where: { workspaceId, accountId: account.id, date: { gte: from, lte: to } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
  ]);
  const openingBalance = account.normalBalance === "DEBIT" ? amount(opening._sum.debit) - amount(opening._sum.credit) : amount(opening._sum.credit) - amount(opening._sum.debit);
  const allRows = calculateRunningBalance(openingBalance, account.normalBalance, entries.map((entry) => ({ debit: amount(entry.debit), credit: amount(entry.credit) }))).map((entry, index) => ({ id: entries[index].id, sourceId: entries[index].sourceId, date: entries[index].date.toISOString(), sourceType: entries[index].sourceType, documentNo: entries[index].documentNo, narration: entries[index].narration, debit: entry.debit, credit: entry.credit, runningBalance: entry.runningBalance }));
  const search = data.search?.toLowerCase();
  const rows = search ? allRows.filter((entry) => entry.documentNo.toLowerCase().includes(search) || entry.narration.toLowerCase().includes(search)) : allRows;
  return { account: { id: account.id, code: account.code, name: account.name, category: account.category, normalBalance: account.normalBalance }, from: from.toISOString(), to: to.toISOString(), openingBalance, entries: rows, closingBalance: allRows.at(-1)?.runningBalance ?? openingBalance };
}

export async function getProfitAndLoss(workspaceId: string, input: ProfitLossInput = {}) {
  const data = profitLossSchema.parse(input);
  const { from, to } = normalizeRange(data);
  const [sales, returns, profitAndLossEntries] = await Promise.all([
    db.salesOrder.findMany({ where: { workspaceId, status: { not: "CANCELLED" }, orderDate: { gte: from, lte: to } }, select: { orderNumber: true, total: true } }),
    db.customerReturn.findMany({ where: { workspaceId, date: { gte: from, lte: to } }, select: { totalAmount: true } }),
    db.generalLedgerEntry.findMany({ where: { workspaceId, date: { gte: from, lte: to }, account: { category: { in: ["COST_OF_SALES", "EXPENSE", "INCOME"] } } }, select: { debit: true, credit: true, account: { select: { id: true, code: true, name: true, category: true, systemCode: true } } } }),
  ]);
  const costOfGoodsSold = profitAndLossEntries.filter((entry) => entry.account.category === "COST_OF_SALES").reduce((sum, entry) => sum + amount(entry.debit) - amount(entry.credit), 0);
  const grossSales = sales.reduce((sum, sale) => sum + amount(sale.total), 0);
  const salesReturns = returns.reduce((sum, entry) => sum + amount(entry.totalAmount), 0);
  const expenseMap = new Map<string, { id: string; code: string; name: string; amount: number }>();
  for (const entry of profitAndLossEntries.filter((row) => row.account.category === "EXPENSE")) {
    const row = expenseMap.get(entry.account.id) ?? { id: entry.account.id, code: entry.account.code, name: entry.account.name, amount: 0 };
    row.amount += amount(entry.debit) - amount(entry.credit);
    expenseMap.set(row.id, row);
  }
  const operatingExpenses = [...expenseMap.values()].reduce((sum, expense) => sum + expense.amount, 0);
  const otherIncome = profitAndLossEntries.filter((entry) => entry.account.systemCode === "OTHER_INCOME").reduce((sum, entry) => sum + amount(entry.credit) - amount(entry.debit), 0);
  const totals = calculateProfitLossTotals({ grossSales, salesReturns, costOfGoodsSold, operatingExpenses });
  return { from: from.toISOString(), to: to.toISOString(), grossSales, salesReturns, otherIncome, expenseCategories: [...expenseMap.values()].sort((a, b) => a.code.localeCompare(b.code)), ...totals, netProfit: totals.netProfit + otherIncome, costingMethod: "Historical sale-time cost and return/cancellation reversals from the authoritative Cost of Goods Sold general-ledger account." };
}

export async function getFinancialDashboard(workspaceId: string) {
  const now = new Date();
  const monthStart = businessMonthStart(now);
  const [receivables, payables, inventory, cashBank, purchasesMonth, lowStock, profitLoss] = await Promise.all([
    getReceivablesAging(workspaceId),
    getPayablesSummary(workspaceId),
    db.product.findMany({ where: { workspaceId }, select: { stockQuantity: true, costPrice: true, reorderLevel: true } }),
    db.cashBankAccount.aggregate({ where: { workspaceId, isActive: true }, _sum: { currentBalance: true } }),
    db.goodReceivedNote.aggregate({ where: { workspaceId, receiptDate: { gte: monthStart, lte: now } }, _sum: { totalAmount: true } }),
    db.product.count({ where: { workspaceId, stockQuantity: { lte: db.product.fields.reorderLevel } } }),
    getProfitAndLoss(workspaceId, { from: monthStart, to: now }),
  ]);
  const inventoryValue = inventory.reduce((sum, product) => sum + product.stockQuantity * amount(product.costPrice), 0);
  const receivableAmount = receivables.totalOutstanding;
  const payableAmount = payables.totalOutstanding;
  const cashBankAmount = amount(cashBank._sum.currentBalance);
  return { receivables: receivableAmount, payables: payableAmount, inventoryValue, cashBank: cashBankAmount, salesThisMonth: profitLoss.grossSales, purchasesThisMonth: amount(purchasesMonth._sum.totalAmount), expensesThisMonth: profitLoss.operatingExpenses, grossProfit: profitLoss.grossProfit, netProfit: profitLoss.netProfit, lowStockCount: lowStock, netOperatingPosition: receivableAmount + inventoryValue + cashBankAmount - payableAmount };
}
