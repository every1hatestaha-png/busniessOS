-- Restaurant V1.48: preserve every Product that is still part of Restaurant operational or historical state.
-- Restaurant product references are intentionally stored outside Prisma relations in the industry tables,
-- so the database must prevent a physical Product delete from creating dangling menu/recipe/return history.

CREATE OR REPLACE FUNCTION reject_restaurant_referenced_product_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_menu_items" mi
    WHERE mi."productId" = OLD."id"
      AND mi."workspaceId"::text = OLD."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant-linked product cannot be deleted while referenced by a menu item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "recipes" r
    WHERE r."finishedProductId"::text = OLD."id"
      AND r."workspaceId"::text = OLD."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant-linked product cannot be deleted while referenced by a recipe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "recipe_items" ri
    INNER JOIN "recipes" r ON r."id" = ri."recipeId"
    WHERE ri."ingredientProductId"::text = OLD."id"
      AND r."workspaceId"::text = OLD."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant-linked product cannot be deleted while referenced by a recipe ingredient';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "restaurant_inventory_consumptions" ric
    WHERE ric."productId" = OLD."id"
      AND ric."workspaceId"::text = OLD."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant-linked product cannot be deleted while referenced by inventory history';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS product_restaurant_reference_delete_guard ON "products";
CREATE TRIGGER product_restaurant_reference_delete_guard
BEFORE DELETE ON "products"
FOR EACH ROW
EXECUTE FUNCTION reject_restaurant_referenced_product_delete();
