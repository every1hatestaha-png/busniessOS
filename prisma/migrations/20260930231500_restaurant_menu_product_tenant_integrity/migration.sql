-- Restaurant V1.47: menu item -> inventory product tenant integrity.
-- productId is authoritative for recipe lookup/direct stock consumption during order completion.
-- Fail closed if any historical non-null product link is missing or belongs to another workspace.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_menu_items" mi
    WHERE mi."productId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "products" p
        WHERE p."id" = mi."productId"
          AND p."workspaceId"::text = mi."workspaceId"::text
      )
  ) THEN
    RAISE EXCEPTION 'Restaurant menu product tenant integrity check failed: historical invalid product link exists';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_restaurant_menu_product_tenant_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."productId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "products" p
    WHERE p."id" = NEW."productId"
      AND p."workspaceId"::text = NEW."workspaceId"::text
  ) THEN
    RAISE EXCEPTION 'Restaurant menu product must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurant_menu_items_b_product_tenant_parent_guard ON "restaurant_menu_items";
CREATE TRIGGER restaurant_menu_items_b_product_tenant_parent_guard
BEFORE INSERT OR UPDATE OF "workspaceId", "productId"
ON "restaurant_menu_items"
FOR EACH ROW
EXECUTE FUNCTION enforce_restaurant_menu_product_tenant_parent();
