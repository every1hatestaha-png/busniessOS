-- Every newly collected active restaurant payment must be posted to accounting
-- before its transaction commits. The deferred trigger queries the current row,
-- so an INSERT followed by a same-transaction postedAt update is valid.
-- Existing historical rows are not rewritten by this migration.

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_posted_on_commit()
RETURNS trigger AS $$
DECLARE
  current_posted_at timestamptz;
  current_voided_at timestamptz;
BEGIN
  SELECT rp."postedAt", rp."voidedAt"
    INTO current_posted_at, current_voided_at
  FROM "restaurant_payments" rp
  WHERE rp."id" = NEW."id"
    AND rp."workspaceId" = NEW."workspaceId";

  IF current_voided_at IS NULL AND current_posted_at IS NULL THEN
    RAISE EXCEPTION 'Active restaurant payment must be posted in the collection transaction';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_payments_require_posting" ON "restaurant_payments";
CREATE CONSTRAINT TRIGGER "restaurant_payments_require_posting"
AFTER INSERT OR UPDATE OF "amount", "voidedAt", "postedAt", "cashBankAccountId"
ON "restaurant_payments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_payment_posted_on_commit();
