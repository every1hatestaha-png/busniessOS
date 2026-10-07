-- Restaurant Workspace V1.2 refunds
-- Full refunds only. The original payment remains preserved and is marked voided
-- only as part of the same serializable refund transaction.

CREATE TABLE IF NOT EXISTS "restaurant_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "restaurantOrderId" uuid NOT NULL REFERENCES "restaurant_orders"("id") ON DELETE RESTRICT,
  "restaurantPaymentId" uuid NOT NULL REFERENCES "restaurant_payments"("id") ON DELETE RESTRICT,
  "cashBankAccountId" text NOT NULL,
  "amount" numeric(15,2) NOT NULL CHECK ("amount" > 0),
  "reason" text NOT NULL CHECK (char_length("reason") BETWEEN 3 AND 500),
  "idempotencyKey" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_refunds_workspace_payment_unique"
  ON "restaurant_refunds"("workspaceId", "restaurantPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_refunds_workspace_idempotency_unique"
  ON "restaurant_refunds"("workspaceId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "restaurant_refunds_workspace_order_idx"
  ON "restaurant_refunds"("workspaceId", "restaurantOrderId", "createdAt");

CREATE OR REPLACE FUNCTION enforce_restaurant_refund_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "restaurant_payments" rp
    WHERE rp."id" = NEW."restaurantPaymentId"
      AND rp."workspaceId" = NEW."workspaceId"
      AND rp."restaurantOrderId" = NEW."restaurantOrderId"
      AND rp."cashBankAccountId" = NEW."cashBankAccountId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace or mismatched restaurant refund payment reference rejected';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "cash_bank_accounts" cba
    WHERE cba."id" = NEW."cashBankAccountId"
      AND cba."workspaceId"::uuid = NEW."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace restaurant refund cash account reference rejected';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_refunds_tenant_parent_guard" ON "restaurant_refunds";
CREATE TRIGGER "restaurant_refunds_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantOrderId", "restaurantPaymentId", "cashBankAccountId"
ON "restaurant_refunds"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_refund_tenant_parent();