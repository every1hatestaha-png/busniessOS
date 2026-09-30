-- Receipt identity and collected terms stay tied to their original posting.
-- Posting markers, notes and manager-controlled refund/void fields remain
-- available to existing business flows. Retries cannot lose their receipt key.
CREATE OR REPLACE FUNCTION enforce_restaurant_payment_financial_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
     OR NEW."cashBankAccountId" IS DISTINCT FROM OLD."cashBankAccountId"
     OR NEW."method" IS DISTINCT FROM OLD."method"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" THEN
    RAISE EXCEPTION 'Restaurant payment financial snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "restaurant_payments_financial_snapshot_immutable"
BEFORE UPDATE OF "id", "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "idempotencyKey"
ON "restaurant_payments"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_payment_financial_snapshot_immutable();
