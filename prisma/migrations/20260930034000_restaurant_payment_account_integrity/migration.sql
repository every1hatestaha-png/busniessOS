-- Restaurant payment method and settlement account must agree.
-- This protects physical drawer reconciliation and prevents non-cash receipts
-- from being posted into the cash-on-hand account through alternate callers.
-- Cross-workspace and missing account references remain owned by the older
-- tenant-parent guard so its established error contract is preserved.

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_account_integrity()
RETURNS trigger AS $$
DECLARE
  account_workspace uuid;
  account_is_bank boolean;
  account_is_active boolean;
BEGIN
  SELECT cba."workspaceId"::uuid, cba."isBank", cba."isActive"
    INTO account_workspace, account_is_bank, account_is_active
  FROM "cash_bank_accounts" cba
  WHERE cba."id" = NEW."cashBankAccountId";

  -- Let restaurant_payments_tenant_parent_guard remain authoritative for
  -- missing and cross-workspace settlement account references.
  IF NOT FOUND OR account_workspace IS DISTINCT FROM NEW."workspaceId" THEN
    RETURN NEW;
  END IF;

  IF account_is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Restaurant payment settlement account is inactive';
  END IF;

  IF NEW."method" = 'CASH' AND account_is_bank THEN
    RAISE EXCEPTION 'Cash restaurant payments must use a physical cash account';
  END IF;

  IF NEW."method" IN ('BANK_TRANSFER','CHEQUE','CREDIT_CARD','MOBILE_WALLET','JAZZCASH','EASYPAISA')
     AND NOT account_is_bank THEN
    RAISE EXCEPTION 'Non-cash restaurant payments must use a bank or digital settlement account';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_payments_account_integrity" ON "restaurant_payments";
CREATE TRIGGER "restaurant_payments_account_integrity"
BEFORE INSERT OR UPDATE OF "method", "cashBankAccountId", "workspaceId"
ON "restaurant_payments"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_payment_account_integrity();