-- Full refunds are recorded once in the same transaction as cash/ledger reversal.
-- No application flow edits a refund. Preserve original attribution and retry
-- inputs as well as financial identity. DELETE retention is a separate concern.
CREATE OR REPLACE FUNCTION enforce_restaurant_refund_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
     OR NEW."restaurantPaymentId" IS DISTINCT FROM OLD."restaurantPaymentId"
     OR NEW."cashBankAccountId" IS DISTINCT FROM OLD."cashBankAccountId"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Restaurant refund snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "restaurant_refunds_financial_snapshot_immutable"
BEFORE UPDATE ON "restaurant_refunds"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_refund_snapshot_immutable();
