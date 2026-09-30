-- KEY SHARE permits non-key updates, including status-only commitment.
-- SHARE conflicts with those updates and holds the lifecycle boundary stable
-- until line cleanup commits or rolls back. Keep the V1.20 cascade and explicit
-- superuser maintenance behavior unchanged. No historical migration is edited.

CREATE OR REPLACE FUNCTION enforce_restaurant_order_item_delete_integrity()
RETURNS trigger AS $$
DECLARE
  caller_is_superuser boolean;
  parent_order "restaurant_orders"%ROWTYPE;
BEGIN
  SELECT COALESCE(r.rolsuper, false)
    INTO caller_is_superuser
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = current_user;

  IF caller_is_superuser THEN
    RETURN OLD;
  END IF;

  SELECT ro.*
    INTO parent_order
  FROM "restaurant_orders" ro
  WHERE ro."id" = OLD."restaurantOrderId"
  FOR SHARE;

  -- If the parent is gone, this delete is the FK cascade from a parent delete
  -- that already passed restaurant_orders_delete_integrity. A direct child
  -- delete cannot reach this state while the FK remains valid.
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  IF NOT restaurant_order_is_uncommitted_for_delete(parent_order) THEN
    RAISE EXCEPTION 'Restaurant order item history cannot be deleted after commitment';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

