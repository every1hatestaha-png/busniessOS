-- V2 issue-time inventory. Historical rows have NULL marker, preserving
-- their original dispatch-time stock behavior without a data backfill.
ALTER TABLE "outbound_gate_passes"
  ADD COLUMN "issueStockDeductedAt" TIMESTAMP(3);
ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'GATE_PASS_ISSUE';
ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'GATE_PASS_ISSUE_CANCEL';
