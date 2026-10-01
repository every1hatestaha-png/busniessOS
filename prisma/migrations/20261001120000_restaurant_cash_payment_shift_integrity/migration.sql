-- Restaurant V1.84: every new physical cash receipt belongs to an OPEN
-- Restaurant cash shift. The shift identity is immutable payment evidence.
--
-- Historical CASH payments predate this invariant, so cashShiftId remains
-- nullable for existing rows. New CASH inserts cannot omit it.

ALTER TABLE "restaurant_payments"
  ADD COLUMN IF NOT EXISTS "cashShiftId" uuid REFERENCES "cash_shifts"("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "restaurant_payments_workspace_cash_shift_idx"
  ON "restaurant_payments" ("workspaceId", "cashShiftId", "createdAt")
  WHERE "cashShiftId" IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_cash_shift()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  shift_workspace uuid;
  shift_status text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW."cashShiftId" IS DISTINCT FROM OLD."cashShiftId" THEN
    RAISE EXCEPTION 'Restaurant payment cash shift evidence is immutable';
  END IF;

  IF NEW."method" = 'CASH' THEN
    IF NEW."cashShiftId" IS NULL THEN
      RAISE EXCEPTION 'An open restaurant cash shift is required before recording a cash payment';
    END IF;

    SELECT cs."workspaceId", cs."status"
      INTO shift_workspace, shift_status
    FROM "cash_shifts" cs
    WHERE cs."id" = NEW."cashShiftId"
    FOR SHARE;

    IF NOT FOUND OR shift_workspace IS DISTINCT FROM NEW."workspaceId" THEN
      RAISE EXCEPTION 'Restaurant cash payment shift must belong to the same workspace';
    END IF;

    IF shift_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Restaurant cash payment requires an open cash shift';
    END IF;
  ELSIF NEW."cashShiftId" IS NOT NULL THEN
    RAISE EXCEPTION 'Non-cash restaurant payments cannot reference a cash shift';
  END IF;

  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS "restaurant_payments_cash_shift_guard" ON "restaurant_payments";
CREATE TRIGGER "restaurant_payments_cash_shift_guard"
BEFORE INSERT OR UPDATE OF "method", "cashShiftId", "workspaceId"
ON "restaurant_payments"
FOR EACH ROW
EXECUTE FUNCTION enforce_restaurant_payment_cash_shift();


-- A shift may not close while a linked physical cash receipt is still unposted.
-- This protects reconciliation even for lower-level callers that create a valid
-- shift-bound payment before the Restaurant order itself is completed.
CREATE OR REPLACE FUNCTION prevent_cash_shift_close_with_unposted_receipts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'OPEN' AND NEW."status" = 'CLOSED' AND EXISTS (
    SELECT 1
    FROM "restaurant_payments" rp
    WHERE rp."workspaceId" = OLD."workspaceId"
      AND rp."cashShiftId" = OLD."id"
      AND rp."method" = 'CASH'
      AND rp."voidedAt" IS NULL
      AND rp."postedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Restaurant cash shift cannot close while cash payments are still unposted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "cash_shifts_10_unposted_payment_guard" ON "cash_shifts";
CREATE TRIGGER "cash_shifts_10_unposted_payment_guard"
BEFORE UPDATE OF "status"
ON "cash_shifts"
FOR EACH ROW
EXECUTE FUNCTION prevent_cash_shift_close_with_unposted_receipts();
