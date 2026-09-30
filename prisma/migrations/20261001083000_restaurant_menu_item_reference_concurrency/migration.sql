-- Serialize the first Restaurant order-item reference with concurrent menu-item
-- parent mutation. Child-side validation locks the referenced menu item before
-- accepting the historical reference, then validates against committed tenant state.

CREATE OR REPLACE FUNCTION enforce_restaurant_order_item_menu_tenant_parent()
RETURNS trigger AS $$
DECLARE
  menu_workspace uuid;
  order_workspace uuid;
BEGIN
  IF NEW."menuItemId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT mi."workspaceId"
    INTO menu_workspace
  FROM "restaurant_menu_items" mi
  WHERE mi."id" = NEW."menuItemId"
  FOR SHARE;

  SELECT ro."workspaceId"
    INTO order_workspace
  FROM "restaurant_orders" ro
  WHERE ro."id" = NEW."restaurantOrderId";

  IF menu_workspace IS NULL
     OR order_workspace IS NULL
     OR menu_workspace IS DISTINCT FROM order_workspace THEN
    RAISE EXCEPTION 'Restaurant order item menu item must belong to the same workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
