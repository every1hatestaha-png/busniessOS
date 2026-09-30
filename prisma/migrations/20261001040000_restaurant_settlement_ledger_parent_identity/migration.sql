-- Restaurant V1.62: preserve the underlying GL Account behind Restaurant settlement history.
--
-- V1.60 freezes CashBankAccount.accountId after Restaurant financial history references it.
-- The referenced Account row itself can still be rewritten later. That can silently change
-- tenant ownership, chart identity, category or balance semantics for already-posted receipts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_payments" rp
    JOIN "cash_bank_accounts" cba ON cba."id" = rp."cashBankAccountId"
    LEFT JOIN "accounts" a ON a."id" = cba."accountId"
    WHERE a."id" IS NULL
       OR a."workspaceId" IS DISTINCT FROM rp."workspaceId"::text
       OR a."category"::text IS DISTINCT FROM 'ASSET'
       OR a."normalBalance"::text IS DISTINCT FROM 'DEBIT'
  ) THEN
    RAISE EXCEPTION 'Restaurant settlement ledger parent integrity check failed: historical payment ledger is invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "restaurant_refunds" rr
    JOIN "cash_bank_accounts" cba ON cba."id" = rr."cashBankAccountId"
    LEFT JOIN "accounts" a ON a."id" = cba."accountId"
    WHERE a."id" IS NULL
       OR a."workspaceId" IS DISTINCT FROM rr."workspaceId"::text
       OR a."category"::text IS DISTINCT FROM 'ASSET'
       OR a."normalBalance"::text IS DISTINCT FROM 'DEBIT'
  ) THEN
    RAISE EXCEPTION 'Restaurant settlement ledger parent integrity check failed: historical refund ledger is invalid';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION restaurant_settlement_ledger_is_referenced(ledger_account_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "cash_bank_accounts" cba
    WHERE cba."accountId" = ledger_account_id
      AND (
        EXISTS (
          SELECT 1 FROM "restaurant_payments" rp
          WHERE rp."cashBankAccountId" = cba."id"
        )
        OR EXISTS (
          SELECT 1 FROM "restaurant_refunds" rr
          WHERE rr."cashBankAccountId" = cba."id"
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION reject_restaurant_settlement_ledger_parent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF restaurant_settlement_ledger_is_referenced(OLD."id") THEN
      RAISE EXCEPTION 'Restaurant-linked settlement ledger account cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."workspaceId" IS NOT DISTINCT FROM OLD."workspaceId"
     AND NEW."code" IS NOT DISTINCT FROM OLD."code"
     AND NEW."category" IS NOT DISTINCT FROM OLD."category"
     AND NEW."normalBalance" IS NOT DISTINCT FROM OLD."normalBalance" THEN
    RETURN NEW;
  END IF;

  IF restaurant_settlement_ledger_is_referenced(OLD."id") THEN
    RAISE EXCEPTION 'Restaurant-linked settlement ledger identity and accounting semantics are immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_restaurant_settlement_parent_update_guard ON "accounts";
CREATE TRIGGER account_restaurant_settlement_parent_update_guard
BEFORE UPDATE OF "id", "workspaceId", "code", "category", "normalBalance"
ON "accounts"
FOR EACH ROW
EXECUTE FUNCTION reject_restaurant_settlement_ledger_parent_mutation();

DROP TRIGGER IF EXISTS account_restaurant_settlement_parent_delete_guard ON "accounts";
CREATE TRIGGER account_restaurant_settlement_parent_delete_guard
BEFORE DELETE
ON "accounts"
FOR EACH ROW
EXECUTE FUNCTION reject_restaurant_settlement_ledger_parent_mutation();
