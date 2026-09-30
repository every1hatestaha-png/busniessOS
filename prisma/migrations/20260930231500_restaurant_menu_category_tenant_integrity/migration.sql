-- restaurant_menu_items.categoryId has a plain FK to restaurant_menu_categories(id).
-- Existence alone does not prove that the category belongs to the menu item's
-- workspace. Fail closed on historical mismatches, then enforce same-workspace
-- ownership for every insert and relevant update.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_menu_items" mi
    JOIN "restaurant_menu_categories" mc ON mc."id" = mi."categoryId"
    WHERE mc."workspaceId" <> mi."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Existing restaurant menu item category workspace mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_menu_category_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "restaurant_menu_categories" mc
    WHERE mc."id" = NEW."categoryId"
      AND mc."workspaceId" = NEW."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant menu category must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_menu_items_category_tenant_parent_guard"
ON "restaurant_menu_items";
CREATE TRIGGER "restaurant_menu_items_category_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "categoryId"
ON "restaurant_menu_items"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_menu_category_tenant_parent();
