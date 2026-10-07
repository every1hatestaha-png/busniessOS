-- Restaurant V1.65: serialize Restaurant inventory history with Warehouse parent mutations.
--
-- V1.64 freezes Warehouse identity/workspace after history becomes visible. Lock the
-- referenced Warehouse while new consumption/return-movement rows are validated so
-- the first historical reference cannot race a tenant move or delete.

CREATE OR REPLACE FUNCTION lock_restaurant_warehouse_parent(
  warehouse_id uuid,
  expected_workspace uuid,
  error_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  actual_workspace uuid;
BEGIN
  IF warehouse_id IS NULL THEN
    RETURN;
  END IF;

  SELECT w."workspaceId"
    INTO actual_workspace
  FROM "warehouses" w
  WHERE w."id" = warehouse_id
  FOR SHARE;

  IF actual_workspace IS NULL OR actual_workspace IS DISTINCT FROM expected_workspace THEN
    RAISE EXCEPTION '%', error_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION lock_restaurant_consumption_warehouse_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM lock_restaurant_warehouse_parent(
    NEW."warehouseId",
    NEW."workspaceId",
    'Restaurant inventory consumption warehouse belongs to another workspace'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "restaurant_inventory_consumptions_y_warehouse_parent_lock"
  ON "restaurant_inventory_consumptions";
CREATE TRIGGER "restaurant_inventory_consumptions_y_warehouse_parent_lock"
BEFORE INSERT ON "restaurant_inventory_consumptions"
FOR EACH ROW
EXECUTE FUNCTION lock_restaurant_consumption_warehouse_parent();

CREATE OR REPLACE FUNCTION lock_restaurant_return_movement_warehouse_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM lock_restaurant_warehouse_parent(
    NEW."warehouseId",
    NEW."workspaceId",
    'Restaurant return inventory movement warehouse belongs to another workspace'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "restaurant_return_inventory_movements_warehouse_parent_lock"
  ON "restaurant_return_inventory_movements";
CREATE TRIGGER "restaurant_return_inventory_movements_warehouse_parent_lock"
BEFORE INSERT ON "restaurant_return_inventory_movements"
FOR EACH ROW
EXECUTE FUNCTION lock_restaurant_return_movement_warehouse_parent();
