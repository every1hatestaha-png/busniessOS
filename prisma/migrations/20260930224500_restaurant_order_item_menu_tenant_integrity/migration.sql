-- restaurant_order_items inherits tenant ownership through restaurantOrderId.
-- menuItemId has a plain FK, so existence alone does not prove that the menu item
-- belongs to the same workspace as the parent order. Fail closed on historical
-- mismatches, then enforce same-workspace ownership at the database boundary.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_order_items" oi
    JOIN "restaurant_orders" ro ON ro."id" = oi."restaurantOrderId"
    JOIN "restaurant_menu_items" mi ON mi."id" = oi."menuItemId"
    WHERE oi."menuItemId" IS NOT NULL
      AND mi."workspaceId" <> ro."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Existing restaurant order item menu workspace mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_order_item_menu_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NEW."menuItemId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "restaurant_orders" ro
       JOIN "restaurant_menu_items" mi
         ON mi."id" = NEW."menuItemId"
        AND mi."workspaceId" = ro."workspaceId"
       WHERE ro."id" = NEW."restaurantOrderId"
     ) THEN
    RAISE EXCEPTION 'Restaurant order item menu item must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_order_items_a_menu_tenant_parent_guard"
ON "restaurant_order_items";
CREATE TRIGGER "restaurant_order_items_a_menu_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "restaurantOrderId", "menuItemId"
ON "restaurant_order_items"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_item_menu_tenant_parent();
