-- Restaurant V1.49: recipe -> Product tenant integrity.
-- Restaurant completion trusts recipe finished/ingredient product IDs when creating
-- inventory-consumption snapshots. Reject forged or dangling cross-workspace links.

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
    RAISE EXCEPTION 'Restaurant recipe tenant integrity check failed: historical invalid finished product link exists';
  END IF;

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
    RAISE EXCEPTION 'Restaurant recipe tenant integrity check failed: historical invalid ingredient product link exists';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_restaurant_recipe_product_tenant_parent()
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

  -- A recipe workspace move must also preserve ownership of every already-linked
  -- ingredient. Without this check, changing workspaceId + finishedProductId together
  -- could leave existing recipe_items pointing at the previous tenant's Products.
  IF TG_OP = 'UPDATE' AND NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" AND EXISTS (
    SELECT 1
    FROM "recipe_items" ri
    WHERE ri."recipeId" = NEW."id"
      AND NOT EXISTS (
        SELECT 1
        FROM "products" p
        WHERE p."id" = ri."ingredientProductId"::text
          AND p."workspaceId" = NEW."workspaceId"::text
      )
  ) THEN
    RAISE EXCEPTION 'Restaurant recipe ingredients must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_recipe_ingredient_tenant_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recipe_workspace uuid;
BEGIN
  SELECT r."workspaceId"
  INTO recipe_workspace
  FROM "recipes" r
  WHERE r."id" = NEW."recipeId";

  IF recipe_workspace IS NULL THEN
    RAISE EXCEPTION 'Restaurant recipe ingredient parent recipe is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "products" p
    WHERE p."id" = NEW."ingredientProductId"::text
      AND p."workspaceId" = recipe_workspace::text
  ) THEN
    RAISE EXCEPTION 'Restaurant recipe ingredient product must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurant_recipes_product_tenant_parent_guard ON "recipes";
CREATE TRIGGER restaurant_recipes_product_tenant_parent_guard
BEFORE INSERT OR UPDATE OF "workspaceId", "finishedProductId"
ON "recipes"
FOR EACH ROW
EXECUTE FUNCTION enforce_restaurant_recipe_product_tenant_parent();

DROP TRIGGER IF EXISTS restaurant_recipe_items_product_tenant_parent_guard ON "recipe_items";
CREATE TRIGGER restaurant_recipe_items_product_tenant_parent_guard
BEFORE INSERT OR UPDATE OF "recipeId", "ingredientProductId"
ON "recipe_items"
FOR EACH ROW
EXECUTE FUNCTION enforce_restaurant_recipe_ingredient_tenant_parent();
