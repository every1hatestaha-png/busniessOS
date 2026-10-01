-- Terminal restaurant operational records are append-only evidence. New kitchen
-- tickets always enter the lifecycle at QUEUED, terminal tickets cannot be
-- rewritten, and application roles cannot remove their history. Cancellation
-- timestamps initialize only with cancellation and cannot later be changed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "restaurant_orders" ro
    WHERE (ro."status" = 'CANCELLED') <> (ro."cancelledAt" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Restaurant terminal evidence integrity check failed: historical cancellation timestamp mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_kitchen_ticket_evidence_snapshot()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'QUEUED'
       OR NEW."startedAt" IS NOT NULL
       OR NEW."readyAt" IS NOT NULL
       OR NEW."servedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Restaurant kitchen ticket must be inserted in the QUEUED state';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" IN ('SERVED','CANCELLED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Terminal restaurant kitchen ticket snapshot is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kitchen_tickets_01_evidence_snapshot_guard" ON "kitchen_tickets";
CREATE TRIGGER "kitchen_tickets_01_evidence_snapshot_guard"
BEFORE INSERT OR UPDATE ON "kitchen_tickets"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_kitchen_ticket_evidence_snapshot();

CREATE OR REPLACE FUNCTION enforce_restaurant_kitchen_ticket_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Restaurant kitchen ticket history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "kitchen_tickets_delete_integrity" ON "kitchen_tickets";
CREATE TRIGGER "kitchen_tickets_delete_integrity"
BEFORE DELETE ON "kitchen_tickets"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_kitchen_ticket_delete_integrity();

CREATE OR REPLACE FUNCTION enforce_restaurant_order_cancellation_evidence()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" = 'CANCELLED' OR NEW."cancelledAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Restaurant order must be inserted before cancellation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."cancelledAt" IS NOT NULL AND NEW."cancelledAt" IS DISTINCT FROM OLD."cancelledAt" THEN
    RAISE EXCEPTION 'Restaurant order cancellation evidence is immutable once recorded';
  END IF;

  IF OLD."cancelledAt" IS NULL AND NEW."cancelledAt" IS NOT NULL AND NEW."status" <> 'CANCELLED' THEN
    RAISE EXCEPTION 'Restaurant order cancelledAt requires CANCELLED status';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_01_cancellation_evidence_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_01_cancellation_evidence_guard"
BEFORE INSERT OR UPDATE OF "status", "cancelledAt" ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_cancellation_evidence();
