ALTER TABLE "credit_notes"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "credit_notes_workspaceId_idempotencyKey_key"
  ON "credit_notes"("workspaceId", "idempotencyKey");

ALTER TABLE "debit_notes"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "status" "CreditNoteStatus" NOT NULL DEFAULT 'OPEN';

CREATE UNIQUE INDEX "debit_notes_workspaceId_idempotencyKey_key"
  ON "debit_notes"("workspaceId", "idempotencyKey");

CREATE INDEX "debit_notes_workspaceId_status_idx"
  ON "debit_notes"("workspaceId", "status");
