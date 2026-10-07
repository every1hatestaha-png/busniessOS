-- Restaurant V1.60: preserve settlement-account identity used by Restaurant financial history.
--
-- restaurant_payments and restaurant_refunds retain cashBankAccountId as text, so
-- there is no database FK protecting those historical references from a later parent
-- mutation. Once referenced, the CashBankAccount identity, tenant, underlying GL
-- account and cash/bank classification must remain stable. Descriptive edits and
-- deactivation remain allowed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_payments" rp
    LEFT JOIN "cash_bank_accounts" cba ON cba."id" = rp."cashBankAccountId"
    LEFT JOIN "accounts" a ON a."id" = cba."accountId"
    WHERE rp."cashBankAccountId" IS NOT NULL
      AND (
        cba."id" IS NULL
        OR cba."workspaceId" IS DISTINCT FROM rp."workspaceId"::text
        OR a."id" IS NULL
        OR a."workspaceId" IS DISTINCT FROM cba."workspaceId"
        OR (rp."method" = 'CASH' AND cba."isBank" IS DISTINCT FROM false)
        OR (
          rp."method" IN ('BANK_TRANSFER','CHEQUE','CREDIT_CARD','MOBILE_WALLET','JAZZCASH','EASYPAISA')
          AND cba."isBank" IS DISTINCT FROM true
        )
      )
  ) THEN
    RAISE EXCEPTION 'Restaurant settlement account parent integrity check failed: historical payment link is invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "restaurant_refunds" rr
    LEFT JOIN "cash_bank_accounts" cba ON cba."id" = rr."cashBankAccountId"
    LEFT JOIN "accounts" a ON a."id" = cba."accountId"
    WHERE cba."id" IS NULL
       OR cba."workspaceId" IS DISTINCT FROM rr."workspaceId"::text
       OR a."id" IS NULL
       OR a."workspaceId" IS DISTINCT FROM cba."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant settlement account parent integrity check failed: historical refund link is invalid';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION restaurant_settlement_account_is_referenced(account_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "restaurant_payments" rp
    WHERE rp."cashBankAccountId" = account_id
  ) OR EXISTS (
    SELECT 1 FROM "restaurant_refunds" rr
    WHERE rr."cashBankAccountId" = account_id
  );
$$;

CREATE OR REPLACE FUNCTION reject_restaurant_settlement_account_parent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF restaurant_settlement_account_is_referenced(OLD."id") THEN
      RAISE EXCEPTION 'Restaurant-linked settlement account cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."workspaceId" IS NOT DISTINCT FROM OLD."workspaceId"
     AND NEW."accountId" IS NOT DISTINCT FROM OLD."accountId"
     AND NEW."isBank" IS NOT DISTINCT FROM OLD."isBank" THEN
    RETURN NEW;
  END IF;

  IF restaurant_settlement_account_is_referenced(OLD."id") THEN
    RAISE EXCEPTION 'Restaurant-linked settlement account identity, workspace, ledger account and type are immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cash_bank_account_restaurant_parent_update_guard ON "cash_bank_accounts";
CREATE TRIGGER cash_bank_account_restaurant_parent_update_guard
BEFORE UPDATE OF "id", "workspaceId", "accountId", "isBank"
ON "cash_bank_accounts"
FOR EACH ROW
EXECUTE FUNCTION reject_restaurant_settlement_account_parent_mutation();

DROP TRIGGER IF EXISTS cash_bank_account_restaurant_parent_delete_guard ON "cash_bank_accounts";
CREATE TRIGGER cash_bank_account_restaurant_parent_delete_guard
BEFORE DELETE
ON "cash_bank_accounts"
FOR EACH ROW
EXECUTE FUNCTION reject_restaurant_settlement_account_parent_mutation();
