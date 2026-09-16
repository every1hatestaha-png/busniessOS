-- Add explicit supplier settlement targets without rewriting historical PO allocations.
-- Existing purchaseOrderId remains for legacy data and parent-PO aggregate compatibility.
ALTER TABLE "payment_allocations"
  ADD COLUMN "goodReceivedNoteId" TEXT,
  ADD COLUMN "isSupplierOpeningBalance" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "payment_allocations_goodReceivedNoteId_idx"
  ON "payment_allocations"("goodReceivedNoteId");

CREATE INDEX "payment_allocations_workspaceId_isSupplierOpeningBalance_idx"
  ON "payment_allocations"("workspaceId", "isSupplierOpeningBalance");

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_goodReceivedNoteId_fkey"
  FOREIGN KEY ("goodReceivedNoteId") REFERENCES "goods_received_notes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
