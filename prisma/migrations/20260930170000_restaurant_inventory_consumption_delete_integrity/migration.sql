-- Historical restaurant inventory consumption is the authoritative basis used
-- by later item returns and compensating return reversals. Application roles
-- must not erase it after completion. Preserve the explicit PostgreSQL
-- superuser maintenance path used by other historical retention guards.

CREATE OR REPLACE FUNCTION enforce_restaurant_inventory_consumption_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Restaurant inventory consumption history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_inventory_consumptions_delete_integrity"
  ON "restaurant_inventory_consumptions";
CREATE TRIGGER "restaurant_inventory_consumptions_delete_integrity"
BEFORE DELETE ON "restaurant_inventory_consumptions"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_inventory_consumption_delete_integrity();
