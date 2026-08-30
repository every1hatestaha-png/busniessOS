-- AlterEnum
ALTER TYPE "DocumentKind" ADD VALUE 'BANK_PAYMENT_VOUCHER';

-- AlterTable
ALTER TABLE "cash_bank_accounts" ADD COLUMN "accountTitle" TEXT,
ADD COLUMN "notes" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "cashBankAccountId" TEXT,
ADD COLUMN "documentNumber" TEXT,
ADD COLUMN "netAmount" DECIMAL(15,2),
ADD COLUMN "withholdingTaxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "payments_workspaceId_documentNumber_key" ON "payments"("workspaceId", "documentNumber");

-- CreateIndex
CREATE INDEX "payments_workspaceId_cashBankAccountId_idx" ON "payments"("workspaceId", "cashBankAccountId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashBankAccountId_fkey" FOREIGN KEY ("cashBankAccountId") REFERENCES "cash_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
