-- CreateEnum
CREATE TYPE "AccountCategory" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'COST_OF_SALES', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountNormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "AccountSystemCode" AS ENUM ('CASH_IN_HAND', 'BANK', 'ACCOUNTS_RECEIVABLE', 'INVENTORY', 'ACCOUNTS_PAYABLE', 'WITHHOLDING_TAX_PAYABLE', 'OWNER_EQUITY', 'SALES_REVENUE', 'OTHER_INCOME', 'COST_OF_GOODS_SOLD', 'SALARY_EXPENSE', 'ELECTRICITY_EXPENSE', 'RENT_EXPENSE', 'FUEL_EXPENSE', 'TRANSPORT_EXPENSE', 'FACTORY_EXPENSE', 'OFFICE_EXPENSE', 'REPAIRS_EXPENSE', 'OTHER_OPERATING_EXPENSE');

-- CreateEnum
CREATE TYPE "GeneralLedgerSourceType" AS ENUM ('EXPENSE', 'PAYMENT', 'RECEIPT', 'SALE', 'PURCHASE', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "DocumentKind" ADD VALUE 'EXPENSE_VOUCHER';

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AccountCategory" NOT NULL,
    "normalBalance" "AccountNormalBalance" NOT NULL,
    "systemCode" "AccountSystemCode",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_bank_accounts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "openingBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "isBank" BOOLEAN NOT NULL DEFAULT false,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(15,2) NOT NULL,
    "payee" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_ledger_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceType" "GeneralLedgerSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "narration" TEXT NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "general_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_workspaceId_code_key" ON "accounts"("workspaceId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_workspaceId_systemCode_key" ON "accounts"("workspaceId", "systemCode");

-- CreateIndex
CREATE INDEX "accounts_workspaceId_category_idx" ON "accounts"("workspaceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "cash_bank_accounts_workspaceId_accountId_key" ON "cash_bank_accounts"("workspaceId", "accountId");

-- CreateIndex
CREATE INDEX "cash_bank_accounts_workspaceId_isActive_idx" ON "cash_bank_accounts"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_workspaceId_voucherNumber_key" ON "expenses"("workspaceId", "voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_workspaceId_idempotencyKey_key" ON "expenses"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "expenses_workspaceId_expenseDate_idx" ON "expenses"("workspaceId", "expenseDate");

-- CreateIndex
CREATE INDEX "expenses_workspaceId_expenseAccountId_idx" ON "expenses"("workspaceId", "expenseAccountId");

-- CreateIndex
CREATE INDEX "general_ledger_entries_workspaceId_accountId_date_idx" ON "general_ledger_entries"("workspaceId", "accountId", "date");

-- CreateIndex
CREATE INDEX "general_ledger_entries_workspaceId_sourceType_sourceId_idx" ON "general_ledger_entries"("workspaceId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_accounts" ADD CONSTRAINT "cash_bank_accounts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_accounts" ADD CONSTRAINT "cash_bank_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_ledger_entries" ADD CONSTRAINT "general_ledger_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_ledger_entries" ADD CONSTRAINT "general_ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
