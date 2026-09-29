-- Restaurant Workspace V1.1 integrity
-- Adds durable payment records plus explicit inventory/accounting posting markers.
-- All changes are additive and tenant scoped.

ALTER TABLE "restaurant_orders"
  ADD COLUMN IF NOT EXISTS "inventoryPostedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "accountingPostedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "inventoryCost" numeric(15,2) NOT NULL DEFAULT 0 CHECK ("inventoryCost" >= 0);

CREATE TABLE IF NOT EXISTS "restaurant_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "restaurantOrderId" uuid NOT NULL REFERENCES "restaurant_orders"("id") ON DELETE RESTRICT,
  "cashBankAccountId" text NOT NULL,
  "method" text NOT NULL CHECK ("method" IN ('CASH','BANK_TRANSFER','CHEQUE','CREDIT_CARD','MOBILE_WALLET','JAZZCASH','EASYPAISA','OTHER')),
  "amount" numeric(15,2) NOT NULL CHECK ("amount" > 0),
  "reference" text,
  "notes" text,
  "idempotencyKey" text,
  "createdById" text,
  "postedAt" timestamptz,
  "voidedAt" timestamptz,
  "voidedById" text,
  "voidReason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "restaurant_payments_workspace_order_idx"
  ON "restaurant_payments"("workspaceId", "restaurantOrderId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_payments_workspace_idempotency_unique"
  ON "restaurant_payments"("workspaceId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- Defense in depth: reject cross-workspace order/cash-account references even if
-- a future caller bypasses the TypeScript domain service.
CREATE OR REPLACE FUNCTION enforce_restaurant_payment_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "restaurant_orders" ro
    WHERE ro."id" = NEW."restaurantOrderId" AND ro."workspaceId" = NEW."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace restaurant payment order reference rejected';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "cash_bank_accounts" cba
    WHERE cba."id" = NEW."cashBankAccountId" AND cba."workspaceId"::uuid = NEW."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace restaurant payment cash account reference rejected';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_payments_tenant_parent_guard" ON "restaurant_payments";
CREATE TRIGGER "restaurant_payments_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantOrderId", "cashBankAccountId"
ON "restaurant_payments"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_payment_tenant_parent();
