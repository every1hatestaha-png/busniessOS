-- Restaurant V1.59: serialize Product parent mutations with Restaurant child references.
--
-- V1.58 prevents Product identity/workspace rewrites once Restaurant references are
-- visible. Without child-side row locks, a concurrent Product mutation and new
-- Restaurant reference could both validate against stale state. Every child path
-- now takes a SHARE lock on the Product before validating tenant ownership. This
-- conflicts with Product UPDATE/DELETE row locks so one side commits first and the
-- loser revalidates against committed state.

CREATE OR REPLACE FUNCTION lock_restaurant_product_parent(
  product_id text,
  expected_workspace text,
  error_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  actual_workspace text;
BEGIN
  SELECT p."workspaceId"
  INTO actual_workspace
  FROM "products" p
  WHERE p."id" = product_id
  FOR SHARE;

  IF actual_workspace IS NULL OR actual_workspace IS DISTINCT FROM expected_workspace THEN
    RAISE EXCEPTION '%', error_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_menu_product_tenant_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."productId" IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM lock_restaurant_product_parent(
    NEW."productId",
    NEW."workspaceId"::text,
    'Restaurant menu product must belong to the same workspace'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_recipe_product_tenant_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM lock_restaurant_product_parent(
    NEW."finishedProductId"::text,
    NEW."workspaceId"::text,
    'Restaurant recipe finished product must belong to the same workspace'
  );

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

  PERFORM lock_restaurant_product_parent(
    NEW."ingredientProductId"::text,
    recipe_workspace::text,
    'Restaurant recipe ingredient product must belong to the same workspace'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_restaurant_inventory_consumption_tenant_integrity()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "restaurant_orders" ro
    WHERE ro."id" = NEW."restaurantOrderId"
      AND ro."workspaceId" = NEW."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant inventory consumption order belongs to another workspace';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "restaurant_order_items" roi
    WHERE roi."id" = NEW."restaurantOrderItemId"
      AND roi."restaurantOrderId" = NEW."restaurantOrderId"
  ) THEN
    RAISE EXCEPTION 'Restaurant inventory consumption item does not belong to the order';
  END IF;

  PERFORM lock_restaurant_product_parent(
    NEW."productId",
    NEW."workspaceId"::text,
    'Restaurant inventory consumption product belongs to another workspace'
  );

  IF NEW."warehouseId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "warehouses" w
    WHERE w."id" = NEW."warehouseId"
      AND w."workspaceId" = NEW."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Restaurant inventory consumption warehouse belongs to another workspace';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_restaurant_return_inventory_movement_parent()
RETURNS trigger AS $$
DECLARE
  parent_workspace uuid;
  parent_order uuid;
  parent_reversal boolean;
BEGIN
  SELECT rr."workspaceId", rr."restaurantOrderId", rr."isReversal"
    INTO parent_workspace, parent_order, parent_reversal
  FROM "restaurant_returns" rr
  WHERE rr."id" = NEW."restaurantReturnId";

  IF parent_workspace IS NULL OR parent_workspace IS DISTINCT FROM NEW."workspaceId" THEN
    RAISE EXCEPTION 'Restaurant return inventory movement parent is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "restaurant_order_items" roi
    WHERE roi."id" = NEW."restaurantOrderItemId"
      AND roi."restaurantOrderId" = parent_order
  ) THEN
    RAISE EXCEPTION 'Restaurant return inventory movement order item is invalid';
  END IF;

  IF (NOT parent_reversal AND NEW."quantity" <= 0)
     OR (parent_reversal AND NEW."quantity" >= 0) THEN
    RAISE EXCEPTION 'Restaurant return inventory movement polarity mismatch';
  END IF;

  PERFORM lock_restaurant_product_parent(
    NEW."productId",
    NEW."workspaceId"::text,
    'Restaurant return inventory movement product belongs to another workspace'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM "restaurant_inventory_consumptions" ric
    WHERE ric."workspaceId" = NEW."workspaceId"
      AND ric."restaurantOrderId" = parent_order
      AND ric."restaurantOrderItemId" = NEW."restaurantOrderItemId"
      AND ric."productId" = NEW."productId"
      AND ric."warehouseId" IS NOT DISTINCT FROM NEW."warehouseId"
      AND ric."unitCost" = NEW."unitCost"
  ) THEN
    RAISE EXCEPTION 'Restaurant return inventory movement has no matching immutable consumption snapshot';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
