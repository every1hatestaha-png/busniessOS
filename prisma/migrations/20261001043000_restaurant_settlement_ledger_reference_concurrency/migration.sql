-- Restaurant V1.63: serialize the first Restaurant settlement reference with its GL Account.
--
-- V1.61 locks CashBankAccount while a payment/refund reference is created. V1.62 freezes
-- the underlying Account after Restaurant history exists. Lock both parent rows during
-- child validation so an Account workspace/category/normal-balance mutation cannot race
-- the first Restaurant financial reference.

CREATE OR REPLACE FUNCTION lock_restaurant_settlement_parents(
  cash_bank_account_id text,
  expected_workspace uuid
)
RETURNS TABLE (
  account_workspace uuid,
  account_is_bank boolean,
  account_is_active boolean,
  ledger_workspace text,
  ledger_category text,
  ledger_normal_balance text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cba."workspaceId"::uuid,
    cba."isBank",
    cba."isActive",
    a."workspaceId"::text,
    a."category"::text,
    a."normalBalance"::text
  FROM "cash_bank_accounts" cba
  INNER JOIN "accounts" a ON a."id" = cba."accountId"
  WHERE cba."id" = cash_bank_account_id
  FOR SHARE OF cba, a;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_account_integrity()
RETURNS trigger AS $$
DECLARE
  parent RECORD;
BEGIN
  SELECT * INTO parent
  FROM lock_restaurant_settlement_parents(NEW."cashBankAccountId", NEW."workspaceId")
  LIMIT 1;

  -- Preserve the established tenant-parent error contract for missing or
  -- cross-workspace CashBankAccount references.
  IF NOT FOUND OR parent.account_workspace IS DISTINCT FROM NEW."workspaceId" THEN
    RETURN NEW;
  END IF;

  IF parent.ledger_workspace IS DISTINCT FROM NEW."workspaceId"::text
     OR parent.ledger_category IS DISTINCT FROM 'ASSET'
     OR parent.ledger_normal_balance IS DISTINCT FROM 'DEBIT' THEN
    RAISE EXCEPTION 'Restaurant payment settlement ledger account is invalid';
  END IF;

  IF parent.account_is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Restaurant payment settlement account is inactive';
  END IF;

  IF NEW."method" = 'CASH' AND parent.account_is_bank THEN
    RAISE EXCEPTION 'Cash restaurant payments must use a physical cash account';
  END IF;

  IF NEW."method" IN ('BANK_TRANSFER','CHEQUE','CREDIT_CARD','MOBILE_WALLET','JAZZCASH','EASYPAISA')
     AND NOT parent.account_is_bank THEN
    RAISE EXCEPTION 'Non-cash restaurant payments must use a bank or digital settlement account';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_refund_tenant_parent()
RETURNS trigger AS $$
DECLARE
  parent RECORD;
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

  SELECT * INTO parent
  FROM lock_restaurant_settlement_parents(NEW."cashBankAccountId", NEW."workspaceId")
  LIMIT 1;

  IF NOT FOUND OR parent.account_workspace IS DISTINCT FROM NEW."workspaceId" THEN
    RAISE EXCEPTION 'Cross-workspace restaurant refund cash account reference rejected';
  END IF;

  IF parent.ledger_workspace IS DISTINCT FROM NEW."workspaceId"::text
     OR parent.ledger_category IS DISTINCT FROM 'ASSET'
     OR parent.ledger_normal_balance IS DISTINCT FROM 'DEBIT' THEN
    RAISE EXCEPTION 'Restaurant refund settlement ledger account is invalid';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
