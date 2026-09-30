-- Restaurant V1.48: recipe -> finished product tenant integrity.
-- Recipes are selected by workspace + finishedProductId during restaurant inventory posting.
-- Fail closed if any existing recipe points at a missing or foreign-workspace finished product.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "recipes" r
    WHERE NOT EXISTS (
      SELECT 1
      FROM "products" p
      WHERE p."id" = r."finishedProductId"::text
        AND p."workspaceId" = r."workspaceId"::text
    )
  ) THEN
    RAISE EXCEPTION 'Restaurant recipe finished product tenant integrity check failed: historical invalid product link exists';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_restaurant_recipe_finished_product_tenant_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "products" p
    WHERE p."id" = NEW."finishedProductId"::text
      AND p."workspaceId" = NEW."workspaceId"::text
  ) THEN
    RAISE EXCEPTION 'Restaurant recipe finished product must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_finished_product_tenant_parent_guard ON "recipes";
CREATE TRIGGER recipes_finished_product_tenant_parent_guard
BEFORE INSERT OR UPDATE OF "workspaceId", "finishedProductId"
ON "recipes"
FOR EACH ROW
EXECUTE FUNCTION enforce_restaurant_recipe_finished_product_tenant_parent();
