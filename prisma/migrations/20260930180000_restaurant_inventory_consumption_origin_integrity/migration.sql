-- Restaurant inventory-consumption rows are authoritative historical stock/COGS
-- snapshots. They must be created only by the established order-completion
-- snapshot trigger, never by an ad-hoc direct INSERT (even when all tenant IDs
-- are otherwise valid). The nested insert from snapshot_restaurant_inventory_consumptions()
-- executes while the parent restaurant_orders trigger is already on the trigger
-- stack, so pg_trigger_depth() is greater than 1. A direct insert reaches this
-- BEFORE INSERT trigger at depth 1 and is rejected.
--
-- PostgreSQL fires same-event triggers in name order. Keep this trigger after the
-- V1.36 tenant-integrity trigger so malformed cross-tenant/foreign-parent rows
-- retain their more specific rejection, while tenant-valid direct forgeries fall
-- through to this origin guard.

CREATE OR REPLACE FUNCTION enforce_restaurant_inventory_consumption_insert_origin()
RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'Restaurant inventory consumption snapshots can only be created by order completion';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_inventory_consumptions_insert_origin"
  ON "restaurant_inventory_consumptions";
DROP TRIGGER IF EXISTS "restaurant_inventory_consumptions_z_insert_origin"
  ON "restaurant_inventory_consumptions";
CREATE TRIGGER "restaurant_inventory_consumptions_z_insert_origin"
BEFORE INSERT ON "restaurant_inventory_consumptions"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_inventory_consumption_insert_origin();
