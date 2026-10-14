-- Supplemental V2 inventory movement labels. The nullable issueStockDeductedAt
-- column is added by the earlier 20261014133000 marker migration.
ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'GATE_PASS_ISSUE';
ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'GATE_PASS_ISSUE_CANCEL';
