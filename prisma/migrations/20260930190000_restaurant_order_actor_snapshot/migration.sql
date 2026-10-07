-- Restaurant order creator/confirmation attribution is audit history. Same-workspace
-- membership checks prevent foreign actors, but without immutability a valid member
-- could still replace the historical creator/confirmer after the fact.
--
-- POS/MANUAL orders establish creator (and for immediately-confirmed POS, confirmer)
-- at INSERT. WhatsApp orders are intentionally actorless while PENDING_REVIEW and
-- acquire confirmer attribution exactly once during PENDING_REVIEW -> CONFIRMED.

CREATE OR REPLACE FUNCTION enforce_restaurant_order_actor_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."createdById" IS DISTINCT FROM OLD."createdById" THEN
    RAISE EXCEPTION 'Restaurant order creator attribution is immutable';
  END IF;

  IF NEW."confirmedById" IS DISTINCT FROM OLD."confirmedById"
     OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" THEN
    IF NOT (
      OLD."status" = 'PENDING_REVIEW'
      AND NEW."status" = 'CONFIRMED'
      AND OLD."confirmedById" IS NULL
      AND OLD."confirmedAt" IS NULL
      AND NEW."confirmedById" IS NOT NULL
      AND NEW."confirmedAt" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Restaurant order confirmation attribution is immutable';
    END IF;
  END IF;

  IF OLD."status" = 'PENDING_REVIEW' AND NEW."status" = 'CONFIRMED' THEN
    IF NEW."confirmedById" IS NULL OR NEW."confirmedAt" IS NULL THEN
      RAISE EXCEPTION 'Restaurant order confirmation requires actor and timestamp';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_actor_snapshot_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_actor_snapshot_guard"
BEFORE UPDATE OF "createdById", "confirmedById", "confirmedAt", "status"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_actor_snapshot_immutable();
