-- Compensating physical cash movements must serialize with the current drawer
-- close, just as receipt collection does. Historical rows are not rewritten.
CREATE OR REPLACE FUNCTION enforce_restaurant_cash_compensation_shift()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  settlement_id text;
  is_physical_cash boolean;
  active_shift uuid;
BEGIN
  IF TG_TABLE_NAME = 'restaurant_payments' THEN
    IF NEW."voidedAt" IS NOT DISTINCT FROM OLD."voidedAt" OR OLD."postedAt" IS NULL THEN
      RETURN NEW;
    END IF;
    settlement_id := NEW."cashBankAccountId";
  ELSIF TG_TABLE_NAME = 'restaurant_refunds' THEN
    settlement_id := NEW."cashBankAccountId";
  ELSE
    SELECT rp."cashBankAccountId" INTO settlement_id
    FROM "restaurant_payments" rp
    WHERE rp."id" = NEW."restaurantPaymentId" AND rp."workspaceId" = NEW."workspaceId";
  END IF;

  SELECT NOT cba."isBank" INTO is_physical_cash
  FROM "cash_bank_accounts" cba
  WHERE cba."id" = settlement_id AND cba."workspaceId"::uuid = NEW."workspaceId";
  -- Existing tenant and parent guards own invalid references.
  IF is_physical_cash IS DISTINCT FROM true THEN RETURN NEW; END IF;

  SELECT cs."id" INTO active_shift FROM "cash_shifts" cs
  WHERE cs."workspaceId" = NEW."workspaceId" AND cs."status" = 'OPEN'
  FOR SHARE;
  IF active_shift IS NULL THEN
    RAISE EXCEPTION 'An open restaurant cash shift is required for a physical cash compensation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "restaurant_payments_z_cash_compensation_shift"
BEFORE UPDATE OF "voidedAt" ON "restaurant_payments"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_cash_compensation_shift();

CREATE TRIGGER "restaurant_refunds_z_cash_compensation_shift"
BEFORE INSERT ON "restaurant_refunds"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_cash_compensation_shift();

CREATE TRIGGER "restaurant_allocations_z_cash_compensation_shift"
BEFORE INSERT ON "restaurant_return_payment_allocations"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_cash_compensation_shift();
