-- Restaurant completion consumption conservation.
--
-- Restaurant stock is stored at numeric(15,4). Completion aggregates recipe
-- requirements by product and PostgreSQL therefore persists one 4-decimal stock
-- delta per product. Historical return snapshots must sum to that exact persisted
-- delta. Rounding every order-item contribution independently can make the
-- snapshot total larger or smaller than the actual stock movement.
--
-- Allocate recipe-backed consumption with cumulative 4-decimal rounding per
-- product. The allocations telescope, so their sum is exactly ROUND(sum(raw), 4),
-- matching the persisted product/warehouse stock movement. Zero allocations are
-- omitted because restaurant_inventory_consumptions requires quantity > 0.

CREATE OR REPLACE FUNCTION snapshot_restaurant_inventory_consumptions()
RETURNS trigger AS $$
DECLARE
  default_warehouse uuid;
BEGIN
  IF NEW."inventoryPostedAt" IS NULL OR OLD."inventoryPostedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT w."id" INTO default_warehouse
  FROM "warehouses" w
  WHERE w."workspaceId" = NEW."workspaceId"
    AND w."isActive" = true
    AND w."isDefault" = true
  LIMIT 1;

  -- Recipe-backed menu items. Compute raw per-line requirements first, then use
  -- cumulative rounding so all rows for one product add up to the same 4dp
  -- quantity that completion posts to product and warehouse stock.
  WITH recipe_raw AS (
    SELECT
      roi."id" AS "restaurantOrderItemId",
      ri."ingredientProductId"::text AS "productId",
      p."costPrice" AS "unitCost",
      (
        ri."quantity" * (roi."quantity" / r."yieldQuantity") *
        (1 + (ri."wastagePercent" / 100))
      )::numeric AS "rawQuantity"
    FROM "restaurant_order_items" roi
    INNER JOIN "restaurant_menu_items" mi
      ON mi."id" = roi."menuItemId"
     AND mi."workspaceId" = NEW."workspaceId"
    INNER JOIN "recipes" r
      ON r."workspaceId" = NEW."workspaceId"
     AND r."finishedProductId"::text = mi."productId"
     AND r."isActive" = true
    INNER JOIN "recipe_items" ri ON ri."recipeId" = r."id"
    INNER JOIN "products" p
      ON p."id" = ri."ingredientProductId"::text
     AND p."workspaceId" = NEW."workspaceId"::text
    WHERE roi."restaurantOrderId" = NEW."id"
  ), recipe_allocated AS (
    SELECT
      "restaurantOrderItemId",
      "productId",
      "unitCost",
      ROUND(
        SUM("rawQuantity") OVER (
          PARTITION BY "productId"
          ORDER BY "restaurantOrderItemId"
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ),
        4
      ) - COALESCE(
        ROUND(
          SUM("rawQuantity") OVER (
            PARTITION BY "productId"
            ORDER BY "restaurantOrderItemId"
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ),
          4
        ),
        0
      ) AS "quantity"
    FROM recipe_raw
  )
  INSERT INTO "restaurant_inventory_consumptions" (
    "workspaceId", "restaurantOrderId", "restaurantOrderItemId",
    "productId", "warehouseId", "quantity", "unitCost"
  )
  SELECT
    NEW."workspaceId",
    NEW."id",
    ra."restaurantOrderItemId",
    ra."productId",
    default_warehouse,
    ra."quantity",
    ra."unitCost"
  FROM recipe_allocated ra
  WHERE ra."quantity" > 0
  ON CONFLICT ("restaurantOrderItemId", "productId") DO NOTHING;

  -- Direct product menu items are already represented by 4-decimal order-item
  -- quantities, so their exact persisted quantity is the correct snapshot.
  INSERT INTO "restaurant_inventory_consumptions" (
    "workspaceId", "restaurantOrderId", "restaurantOrderItemId",
    "productId", "warehouseId", "quantity", "unitCost"
  )
  SELECT
    NEW."workspaceId",
    NEW."id",
    roi."id",
    mi."productId",
    default_warehouse,
    roi."quantity",
    p."costPrice"
  FROM "restaurant_order_items" roi
  INNER JOIN "restaurant_menu_items" mi
    ON mi."id" = roi."menuItemId"
   AND mi."workspaceId" = NEW."workspaceId"
  INNER JOIN "products" p
    ON p."id" = mi."productId"
   AND p."workspaceId" = NEW."workspaceId"::text
  WHERE roi."restaurantOrderId" = NEW."id"
    AND mi."productId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "recipes" r
      WHERE r."workspaceId" = NEW."workspaceId"
        AND r."finishedProductId"::text = mi."productId"
        AND r."isActive" = true
    )
  ON CONFLICT ("restaurantOrderItemId", "productId") DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
