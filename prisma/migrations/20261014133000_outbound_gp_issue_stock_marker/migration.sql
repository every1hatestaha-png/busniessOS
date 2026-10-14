-- Safe additive marker: NULL for all existing GPs. A new issue-time GP is
-- marked only inside the same serializable transaction as its stock deduction.
-- Existing issued/in-transit passes retain their historical dispatch behavior.
ALTER TABLE "outbound_gate_passes"
  ADD COLUMN "issueStockDeductedAt" TIMESTAMP(3);

ALTER TABLE "outbound_gate_passes"
  ADD CONSTRAINT "outbound_gp_issue_stock_timestamp_requires_issue"
  CHECK ("issueStockDeductedAt" IS NULL OR "issuedAt" IS NOT NULL);
