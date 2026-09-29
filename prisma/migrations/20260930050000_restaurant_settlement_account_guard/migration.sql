-- Restaurant payment method and settlement account must agree on whether money
-- physically enters the cash drawer. This protects cash-shift reconciliation.

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_settlement_account()
RETURNS trigger AS $$
DECLARE
  account_is_bank boolean;
BEGIN
  SELECT cba."isBank"
    INTO account_is_bank
  FROM "cash_bank_accounts" cba
  WHERE cba."id" = NEW."cashBankAccountId"
    AND cba."workspaceId" = NEW."workspaceId"::text
    AND cba."isActive" = true;

  IF account_is_bank IS NULL THEN
    RAISE EXCEPTION 'Restaurant payment settlement account is unavailable';
  END IF;

  IF NEW."method" = 'CASH' AND account_is_bank THEN
    RAISE EXCEPTION 'Cash restaurant payments must use a physical cash account';
  END IF;

  IF NEW."method" IN ('BANK_TRANSFER','CHEQUE','CREDIT_CARD','MOBILE_WALLET','JAZZCASH','EASYPAISA')
     AND NOT account_is_bank THEN
    RAISE EXCEPTION 'Non-cash restaurant payments must use a bank or non-cash settlement account';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_payments_settlement_account_guard" ON "restaurant_payments";
CREATE TRIGGER "restaurant_payments_settlement_account_guard"
BEFORE INSERT OR UPDATE OF "method", "cashBankAccountId", "workspaceId"
ON "restaurant_payments"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_payment_settlement_account();
