-- Restaurant hardening V1.50: shared managed warehouse stock tenant tuple integrity.
-- A warehouse stock row must belong to the same workspace as both its warehouse and product.
-- This protects restaurant inventory posting and all other managed-stock callers without changing stock business logic.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "warehouse_stocks" ws
    WHERE NOT EXISTS (
      SELECT 1
      FROM "warehouses" w
      WHERE w."id" = ws."warehouseId"
        AND w."workspaceId" = ws."workspaceId"
    )
    OR NOT EXISTS (
      SELECT 1
      FROM "products" p
      WHERE p."id" = ws."productId"::text
        AND p."workspaceId" = ws."workspaceId"::text
    )
  ) THEN
    RAISE EXCEPTION 'Warehouse stock tenant tuple integrity check failed: historical invalid warehouse or product link exists';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_warehouse_stock_tenant_tuple()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "warehouses" w
    WHERE w."id" = NEW."warehouseId"
      AND w."workspaceId" = NEW."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Warehouse stock warehouse must belong to the same workspace';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "products" p
    WHERE p."id" = NEW."productId"::text
      AND p."workspaceId" = NEW."workspaceId"::text
  ) THEN
    RAISE EXCEPTION 'Warehouse stock product must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS warehouse_stocks_tenant_tuple_guard ON "warehouse_stocks";
CREATE TRIGGER warehouse_stocks_tenant_tuple_guard
BEFORE INSERT OR UPDATE OF "workspaceId", "warehouseId", "productId"
ON "warehouse_stocks"
FOR EACH ROW
EXECUTE FUNCTION enforce_warehouse_stock_tenant_tuple();
