-- Ahmad-only outbound delivery lifecycle, additive to PR #329 draft migration.
-- Run only on a verified disposable copy of the correct tenant DB before release.
ALTER TABLE "outbound_gate_passes"
  ADD COLUMN "receivingReference" TEXT,
  ADD COLUMN "receivingRecipient" TEXT,
  ADD COLUMN "receivingNotes" TEXT,
  ADD COLUMN "receivingAt" TIMESTAMP(3),
  ADD COLUMN "invoiceId" TEXT,
  ADD COLUMN "salesOrderId" TEXT,
  ADD COLUMN "complianceReviewedById" TEXT,
  ADD COLUMN "complianceReviewedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "outbound_gate_pass_items"
  ADD COLUMN "returnedQuantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN "unitPriceSnapshot" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "unitCostSnapshot" DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE "outbound_gate_pass_items"
  ADD CONSTRAINT "outbound_gp_return_quantity_check"
  CHECK ("returnedQuantity" >= 0 AND "returnedQuantity" <= "rejectedQuantity");

CREATE UNIQUE INDEX "outbound_gate_passes_invoiceId_key" ON "outbound_gate_passes"("invoiceId");
CREATE UNIQUE INDEX "outbound_gate_passes_salesOrderId_key" ON "outbound_gate_passes"("salesOrderId");
ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'GATE_PASS_DISPATCH';
ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'GATE_PASS_RETURN';
