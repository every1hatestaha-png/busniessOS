-- Mirror the established KitchenTicket lifecycle in PostgreSQL so lower-level
-- callers cannot skip operational states or reopen terminal tickets. This guard
-- intentionally enforces only the transition graph; existing service workflows
-- remain responsible for their timestamp/inventory/table side effects.

CREATE OR REPLACE FUNCTION enforce_restaurant_kitchen_ticket_lifecycle()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."status" = 'QUEUED' AND NEW."status" IN ('PREPARING','CANCELLED')) OR
    (OLD."status" = 'PREPARING' AND NEW."status" IN ('READY','CANCELLED')) OR
    (OLD."status" = 'READY' AND NEW."status" IN ('SERVED','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid restaurant kitchen ticket status transition from % to %', OLD."status", NEW."status";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kitchen_tickets_lifecycle_guard" ON "kitchen_tickets";
CREATE TRIGGER "kitchen_tickets_lifecycle_guard"
BEFORE UPDATE OF "status"
ON "kitchen_tickets"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_kitchen_ticket_lifecycle();
