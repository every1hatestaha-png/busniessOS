-- Restaurant V1.49: recipe item -> ingredient product tenant integrity.
-- Ingredient products are consumed during restaurant inventory posting using the parent recipe workspace.
-- Fail closed if any historical ingredient link is missing or belongs to another workspace.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "recipe_items" ri
    INNER JOIN "recipes" r ON r."id" = ri."recipeId"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "products" p
      WHERE p."id" = ri."ingredientProductId"::text
        AND p."workspaceId" = r."workspaceId"::text
    )
  ) THEN
    RAISE EXCEPTION 'Restaurant recipe ingredient tenant integrity check failed: historical invalid ingredient link exists';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_restaurant_recipe_ingredient_tenant_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_workspace_id uuid;
BEGIN
  SELECT r."workspaceId"
    INTO parent_workspace_id
  FROM "recipes" r
  WHERE r."id" = NEW."recipeId";

  IF parent_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant recipe ingredient requires an existing recipe parent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "products" p
    WHERE p."id" = NEW."ingredientProductId"::text
      AND p."workspaceId" = parent_workspace_id::text
  ) THEN
    RAISE EXCEPTION 'Restaurant recipe ingredient must belong to the same workspace as the recipe';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipe_items_ingredient_tenant_parent_guard ON "recipe_items";
CREATE TRIGGER recipe_items_ingredient_tenant_parent_guard
BEFORE INSERT OR UPDATE OF "recipeId", "ingredientProductId"
ON "recipe_items"
FOR EACH ROW
EXECUTE FUNCTION enforce_restaurant_recipe_ingredient_tenant_parent();
