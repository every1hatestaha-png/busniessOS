-- OTHER is not an alternative spelling of physical CASH. Require a non-cash
-- settlement account so it cannot bypass shift evidence and reconciliation.
-- Existing immutable receipts are preserved; this guard validates new writes.
CREATE OR REPLACE FUNCTION enforce_restaurant_payment_account_integrity()
RETURNS trigger AS $$
DECLARE
  parent RECORD;
BEGIN
  SELECT * INTO parent
  FROM lock_restaurant_settlement_parents(NEW."cashBankAccountId", NEW."workspaceId")
  LIMIT 1;

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
  IF NEW."method" IN ('BANK_TRANSFER','CHEQUE','CREDIT_CARD','MOBILE_WALLET','JAZZCASH','EASYPAISA','OTHER')
     AND NOT parent.account_is_bank THEN
    RAISE EXCEPTION 'Non-cash restaurant payments must use a bank or digital settlement account';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
