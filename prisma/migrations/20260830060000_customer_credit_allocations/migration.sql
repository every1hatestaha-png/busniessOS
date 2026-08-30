CREATE TYPE "CreditNoteStatus" AS ENUM ('OPEN', 'PARTIALLY_APPLIED', 'APPLIED', 'CANCELLED');

ALTER TABLE "invoices"
  ADD COLUMN "creditApplied" DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE "credit_notes"
  ADD COLUMN "customerReturnId" TEXT,
  ADD COLUMN "appliedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "remainingAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "status" "CreditNoteStatus" NOT NULL DEFAULT 'OPEN';

UPDATE "credit_notes"
SET "remainingAmount" = "amount",
    "status" = CASE WHEN "amount" > 0 THEN 'OPEN'::"CreditNoteStatus" ELSE 'APPLIED'::"CreditNoteStatus" END
WHERE "remainingAmount" = 0;

UPDATE "credit_notes" cn
SET "customerReturnId" = cr."id"
FROM "customer_returns" cr
WHERE cn."workspaceId" = cr."workspaceId"
  AND cn."reference" = cr."number"
  AND cn."salesOrderId" = cr."salesOrderId"
  AND cn."customerReturnId" IS NULL;

CREATE TABLE "customer_credit_allocations" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "creditNoteId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_credit_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_notes_customerReturnId_key" ON "credit_notes"("customerReturnId");
CREATE INDEX "credit_notes_workspaceId_customerId_date_idx" ON "credit_notes"("workspaceId", "customerId", "date");
CREATE INDEX "credit_notes_workspaceId_status_idx" ON "credit_notes"("workspaceId", "status");
CREATE UNIQUE INDEX "customer_credit_allocations_workspaceId_idempotencyKey_key" ON "customer_credit_allocations"("workspaceId", "idempotencyKey");
CREATE INDEX "customer_credit_allocations_workspaceId_creditNoteId_idx" ON "customer_credit_allocations"("workspaceId", "creditNoteId");
CREATE INDEX "customer_credit_allocations_workspaceId_invoiceId_idx" ON "customer_credit_allocations"("workspaceId", "invoiceId");

ALTER TABLE "credit_notes"
  ADD CONSTRAINT "credit_notes_customerReturnId_fkey" FOREIGN KEY ("customerReturnId") REFERENCES "customer_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_credit_allocations"
  ADD CONSTRAINT "customer_credit_allocations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_credit_allocations"
  ADD CONSTRAINT "customer_credit_allocations_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_credit_allocations"
  ADD CONSTRAINT "customer_credit_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_credit_allocations"
  ADD CONSTRAINT "customer_credit_allocations_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "credit_notes"
  ADD CONSTRAINT "credit_notes_amounts_non_negative" CHECK ("amount" >= 0 AND "appliedAmount" >= 0 AND "remainingAmount" >= 0),
  ADD CONSTRAINT "credit_notes_amounts_consistent" CHECK ("appliedAmount" + "remainingAmount" = "amount");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_credit_applied_non_negative" CHECK ("creditApplied" >= 0),
  ADD CONSTRAINT "invoices_credit_not_over_amount" CHECK ("paidAmount" + "creditApplied" <= "amount");
