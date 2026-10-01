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

  IF TG_OP = 'UPDATE'
     AND NEW."cashShiftId" IS DISTINCT FROM OLD."cashShiftId" THEN
    RAISE EXCEPTION 'Restaurant payment cash shift evidence is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "restaurant_payments_cash_shift_guard" ON "restaurant_payments";
CREATE TRIGGER "restaurant_payments_cash_shift_guard"
BEFORE INSERT OR UPDATE OF "method", "cashShiftId", "workspaceId"
ON "restaurant_payments"
FOR EACH ROW
EXECUTE FUNCTION enforce_restaurant_payment_cash_shift();
