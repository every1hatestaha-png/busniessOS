-- Restaurant order items retain menuItemId after pricing is snapshotted. The
-- order-completion path can still consult the referenced menu item's productId
-- to determine direct-product or recipe inventory consumption. Once an order
-- line references a menu item, parent identity, tenant ownership, category and
-- product mapping must therefore remain stable. Descriptive/menu presentation
-- fields can continue to evolve because historical order lines snapshot their
-- own name and price.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurant_order_items" roi
    JOIN "restaurant_orders" ro ON ro."id" = roi."restaurantOrderId"
    JOIN "restaurant_menu_items" mi ON mi."id" = roi."menuItemId"
    WHERE roi."menuItemId" IS NOT NULL
      AND mi."workspaceId" <> ro."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Existing restaurant menu item parent workspace mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_menu_item_parent_identity()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1
      FROM "restaurant_order_items" roi
      WHERE roi."menuItemId" = OLD."id"
    ) THEN
      RAISE EXCEPTION 'Restaurant-linked menu item cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "restaurant_order_items" roi
    WHERE roi."menuItemId" = OLD."id"
  ) AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
    OR NEW."categoryId" IS DISTINCT FROM OLD."categoryId"
    OR NEW."productId" IS DISTINCT FROM OLD."productId"
  ) THEN
    RAISE EXCEPTION 'Restaurant-linked menu item identity, tenant, category and product mapping are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_menu_items_parent_identity_guard"
  ON "restaurant_menu_items";
CREATE TRIGGER "restaurant_menu_items_parent_identity_guard"
BEFORE UPDATE OF "id", "workspaceId", "categoryId", "productId" OR DELETE
ON "restaurant_menu_items"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_menu_item_parent_identity();
