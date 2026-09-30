-- Restaurant V1.64: preserve Warehouse identity and tenant ownership used by inventory history.
--
-- Completed-order consumption snapshots and return inventory movements retain warehouseId
-- as historical stock-location truth. The consumption FK prevents some deletes, but it does
-- not prevent a Warehouse from moving to another workspace. Freeze id/workspaceId once any
-- Restaurant inventory history references the Warehouse.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_inventory_consumptions" ric
    LEFT JOIN "warehouses" w ON w."id" = ric."warehouseId"
    WHERE ric."warehouseId" IS NOT NULL
      AND (w."id" IS NULL OR w."workspaceId" IS DISTINCT FROM ric."workspaceId")
  ) THEN
    RAISE EXCEPTION 'Restaurant warehouse parent integrity check failed: historical consumption warehouse is invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "restaurant_return_inventory_movements" rim
    LEFT JOIN "warehouses" w ON w."id" = rim."warehouseId"
    WHERE rim."warehouseId" IS NOT NULL
      AND (w."id" IS NULL OR w."workspaceId" IS DISTINCT FROM rim."workspaceId")
  ) THEN
    RAISE EXCEPTION 'Restaurant warehouse parent integrity check failed: historical return warehouse is invalid';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION restaurant_warehouse_is_referenced(warehouse_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "restaurant_inventory_consumptions" ric
    WHERE ric."warehouseId" = warehouse_id
  ) OR EXISTS (
    SELECT 1 FROM "restaurant_return_inventory_movements" rim
    WHERE rim."warehouseId" = warehouse_id
  );
$$;

CREATE OR REPLACE FUNCTION reject_restaurant_warehouse_parent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF restaurant_warehouse_is_referenced(OLD."id") THEN
      RAISE EXCEPTION 'Restaurant-linked warehouse cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."workspaceId" IS NOT DISTINCT FROM OLD."workspaceId" THEN
    RETURN NEW;
  END IF;

  IF restaurant_warehouse_is_referenced(OLD."id") THEN
    RAISE EXCEPTION 'Restaurant-linked warehouse identity and workspace are immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS warehouse_restaurant_parent_update_guard ON "warehouses";
CREATE TRIGGER warehouse_restaurant_parent_update_guard
BEFORE UPDATE OF "id", "workspaceId"
ON "warehouses"
FOR EACH ROW
EXECUTE FUNCTION reject_restaurant_warehouse_parent_mutation();

DROP TRIGGER IF EXISTS warehouse_restaurant_parent_delete_guard ON "warehouses";
CREATE TRIGGER warehouse_restaurant_parent_delete_guard
BEFORE DELETE
ON "warehouses"
FOR EACH ROW
EXECUTE FUNCTION reject_restaurant_warehouse_parent_mutation();
