-- KDS lifecycle timestamps are historical operational evidence. They are written
-- once by the established transition workflows and must remain aligned with the
-- ticket state. Prevent premature timestamp injection, missing timestamps on
-- progressed states, and any rewrite after a timestamp has been recorded.

CREATE OR REPLACE FUNCTION enforce_restaurant_kitchen_ticket_timestamp_integrity()
RETURNS trigger AS $$
BEGIN
  IF OLD."startedAt" IS NOT NULL AND NEW."startedAt" IS DISTINCT FROM OLD."startedAt" THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket startedAt is immutable once recorded';
  END IF;
  IF OLD."readyAt" IS NOT NULL AND NEW."readyAt" IS DISTINCT FROM OLD."readyAt" THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket readyAt is immutable once recorded';
  END IF;
  IF OLD."servedAt" IS NOT NULL AND NEW."servedAt" IS DISTINCT FROM OLD."servedAt" THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket servedAt is immutable once recorded';
  END IF;

  IF OLD."startedAt" IS NULL AND NEW."startedAt" IS NOT NULL
     AND NEW."status" NOT IN ('PREPARING','READY','SERVED') THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket startedAt requires a started lifecycle state';
  END IF;
  IF OLD."readyAt" IS NULL AND NEW."readyAt" IS NOT NULL
     AND NEW."status" NOT IN ('READY','SERVED') THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket readyAt requires a ready lifecycle state';
  END IF;
  IF OLD."servedAt" IS NULL AND NEW."servedAt" IS NOT NULL
     AND NEW."status" <> 'SERVED' THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket servedAt requires SERVED status';
  END IF;

  IF NEW."status" IN ('PREPARING','READY','SERVED') AND NEW."startedAt" IS NULL THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket progressed state requires startedAt';
  END IF;
  IF NEW."status" IN ('READY','SERVED') AND NEW."readyAt" IS NULL THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket ready state requires readyAt';
  END IF;
  IF NEW."status" = 'SERVED' AND NEW."servedAt" IS NULL THEN
    RAISE EXCEPTION 'Restaurant kitchen ticket SERVED state requires servedAt';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kitchen_tickets_timestamp_integrity_guard" ON "kitchen_tickets";
CREATE TRIGGER "kitchen_tickets_timestamp_integrity_guard"
BEFORE UPDATE OF "status", "startedAt", "readyAt", "servedAt"
ON "kitchen_tickets"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_kitchen_ticket_timestamp_integrity();
