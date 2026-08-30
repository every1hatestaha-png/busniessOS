ALTER TYPE "GeneralLedgerSourceType" ADD VALUE IF NOT EXISTS 'REVERSAL';

ALTER TABLE "general_ledger_entries"
  ADD COLUMN "reversalOfId" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedById" TEXT,
  ADD COLUMN "reversalReason" TEXT;

ALTER TABLE "general_ledger_entries"
  ADD CONSTRAINT "general_ledger_entries_reversalOfId_fkey"
  FOREIGN KEY ("reversalOfId") REFERENCES "general_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "general_ledger_entries"
  ADD CONSTRAINT "general_ledger_entries_reversedById_fkey"
  FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "general_ledger_entries_workspaceId_reversalOfId_key"
  ON "general_ledger_entries"("workspaceId", "reversalOfId");
