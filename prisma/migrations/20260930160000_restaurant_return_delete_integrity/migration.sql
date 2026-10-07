-- Restaurant returns are posted financial, inventory, and audit history.
-- Corrections use explicit compensating reversal documents, never hard deletion.
-- Keep the established explicit PostgreSQL superuser maintenance path for
-- isolated DBA/CI teardown; normal application roles cannot erase any layer of
-- a return document, including child lines or payment allocations.

CREATE OR REPLACE FUNCTION enforce_restaurant_return_delete_integrity()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user AND r.rolsuper
  ) THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'restaurant_returns' THEN
    RAISE EXCEPTION 'Restaurant return history cannot be deleted';
  ELSIF TG_TABLE_NAME = 'restaurant_return_items' THEN
    RAISE EXCEPTION 'Restaurant return item history cannot be deleted';
  ELSIF TG_TABLE_NAME = 'restaurant_return_payment_allocations' THEN
    RAISE EXCEPTION 'Restaurant return payment allocation history cannot be deleted';
  END IF;

  RAISE EXCEPTION 'Restaurant return history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_returns_delete_integrity" ON "restaurant_returns";
CREATE TRIGGER "restaurant_returns_delete_integrity"
BEFORE DELETE ON "restaurant_returns"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_delete_integrity();

DROP TRIGGER IF EXISTS "restaurant_return_items_delete_integrity" ON "restaurant_return_items";
CREATE TRIGGER "restaurant_return_items_delete_integrity"
BEFORE DELETE ON "restaurant_return_items"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_delete_integrity();

DROP TRIGGER IF EXISTS "restaurant_return_allocations_delete_integrity" ON "restaurant_return_payment_allocations";
CREATE TRIGGER "restaurant_return_allocations_delete_integrity"
BEFORE DELETE ON "restaurant_return_payment_allocations"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_delete_integrity();
