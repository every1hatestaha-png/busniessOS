ALTER TABLE "payment_allocations"
  ADD COLUMN IF NOT EXISTS "isCustomerOpeningBalance" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "payment_allocations_workspace_customer_opening_idx"
  ON "payment_allocations" ("workspaceId", "isCustomerOpeningBalance");
