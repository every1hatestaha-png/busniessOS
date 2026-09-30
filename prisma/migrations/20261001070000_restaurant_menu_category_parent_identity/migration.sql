-- Restaurant menu items retain categoryId as part of the live menu structure.
-- A plain foreign key prevents deleting a referenced category, but it does not
-- stop the category itself from moving to another workspace or changing identity.
-- Preserve tenant and parent identity once any menu item references the category.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_menu_items" mi
    JOIN "restaurant_menu_categories" mc ON mc."id" = mi."categoryId"
    WHERE mc."workspaceId" <> mi."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Existing restaurant menu category parent workspace mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_menu_category_parent_identity()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1
      FROM "restaurant_menu_items" mi
      WHERE mi."categoryId" = OLD."id"
    ) THEN
      RAISE EXCEPTION 'Restaurant-linked menu category cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "restaurant_menu_items" mi
    WHERE mi."categoryId" = OLD."id"
  ) AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant-linked menu category identity and workspace are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_menu_categories_parent_identity_guard"
  ON "restaurant_menu_categories";
CREATE TRIGGER "restaurant_menu_categories_parent_identity_guard"
BEFORE UPDATE OF "id", "workspaceId" OR DELETE
ON "restaurant_menu_categories"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_menu_category_parent_identity();
