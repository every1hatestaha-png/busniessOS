-- Restaurant V1.61: serialize new Restaurant settlement references with CashBankAccount mutations.
--
-- V1.60 freezes settlement-account identity after a Restaurant payment/refund is visible.
-- Child validation must also lock the parent row so a concurrent mutation/delete cannot
-- pass before the new reference commits, or leave the child validating stale state.

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
  WHERE cba."id" = NEW."cashBankAccountId"
  FOR SHARE;

  -- The tenant-parent trigger remains authoritative for missing/cross-workspace
  -- references, but this trigger always attempts the parent row lock first.
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

CREATE OR REPLACE FUNCTION enforce_restaurant_refund_tenant_parent()
RETURNS trigger AS $$
DECLARE
  account_workspace uuid;
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

  SELECT cba."workspaceId"::uuid
    INTO account_workspace
  FROM "cash_bank_accounts" cba
  WHERE cba."id" = NEW."cashBankAccountId"
  FOR SHARE;

  IF NOT FOUND OR account_workspace IS DISTINCT FROM NEW."workspaceId" THEN
    RAISE EXCEPTION 'Cross-workspace restaurant refund cash account reference rejected';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
