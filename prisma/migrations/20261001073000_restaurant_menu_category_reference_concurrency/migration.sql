-- Serialize the first menu-item reference with concurrent category parent
-- mutation. Child-side validation now takes a SHARE row lock on the category,
-- then validates workspace ownership against the committed parent state.

CREATE OR REPLACE FUNCTION enforce_restaurant_menu_category_tenant_parent()
RETURNS trigger AS $$
DECLARE
  parent_workspace uuid;
BEGIN
  SELECT mc."workspaceId"
    INTO parent_workspace
  FROM "restaurant_menu_categories" mc
  WHERE mc."id" = NEW."categoryId"
  FOR SHARE;

  IF parent_workspace IS NULL
     OR parent_workspace IS DISTINCT FROM NEW."workspaceId" THEN
    RAISE EXCEPTION 'Restaurant menu category must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
