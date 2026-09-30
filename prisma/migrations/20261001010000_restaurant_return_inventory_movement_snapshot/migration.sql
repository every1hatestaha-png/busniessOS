-- Restaurant V1.54: exact per-return-item inventory movement snapshots.
--
-- Return/restock quantities are stored at numeric(15,4). Recomputing each partial
-- return independently from the original consumption snapshot can make several
-- legitimate partial returns restore more or less inventory than the completed
-- order consumed. Persist the exact movement applied by each return item/product
-- so cumulative allocation and later compensating reversal can be exact.

CREATE TABLE "restaurant_return_inventory_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "restaurantReturnId" uuid NOT NULL REFERENCES "restaurant_returns"("id") ON DELETE RESTRICT,
  "restaurantReturnItemId" uuid NOT NULL REFERENCES "restaurant_return_items"("id") ON DELETE RESTRICT,
  "restaurantOrderItemId" uuid NOT NULL REFERENCES "restaurant_order_items"("id") ON DELETE RESTRICT,
  "productId" text NOT NULL,
  "warehouseId" uuid,
  "quantity" numeric(15,4) NOT NULL,
  "unitCost" numeric(15,4) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "restaurant_return_inventory_movements_quantity_nonzero" CHECK ("quantity" <> 0),
  CONSTRAINT "restaurant_return_inventory_movements_unit_cost_nonnegative" CHECK ("unitCost" >= 0),
  CONSTRAINT "restaurant_return_inventory_movements_item_product_unique" UNIQUE ("restaurantReturnItemId", "productId")
);

CREATE INDEX "restaurant_return_inventory_movements_return_idx"
  ON "restaurant_return_inventory_movements"("workspaceId", "restaurantReturnId");
CREATE INDEX "restaurant_return_inventory_movements_order_item_product_idx"
  ON "restaurant_return_inventory_movements"("workspaceId", "restaurantOrderItemId", "productId");

-- Backfill the exact algorithm used before V1.54. Normal return items restored
-- ROUND(consumption * returned/original, 4); reversal items consumed the same
-- quantity with opposite polarity. This preserves historical truth rather than
-- retroactively reallocating old movements.
INSERT INTO "restaurant_return_inventory_movements" (
  "workspaceId", "restaurantReturnId", "restaurantReturnItemId",
  "restaurantOrderItemId", "productId", "warehouseId", "quantity", "unitCost", "createdAt"
)
SELECT
  rri."workspaceId",
  rri."restaurantReturnId",
  rri."id",
  rri."restaurantOrderItemId",
  ric."productId",
  ric."warehouseId",
  CASE WHEN rri."isReversal"
    THEN -ROUND(ric."quantity" * (ABS(rri."quantity") / roi."quantity"), 4)
    ELSE  ROUND(ric."quantity" * (rri."quantity" / roi."quantity"), 4)
  END,
  ric."unitCost",
  rri."createdAt"
FROM "restaurant_return_items" rri
INNER JOIN "restaurant_returns" rr
  ON rr."id" = rri."restaurantReturnId"
 AND rr."workspaceId" = rri."workspaceId"
INNER JOIN "restaurant_order_items" roi
  ON roi."id" = rri."restaurantOrderItemId"
 AND roi."restaurantOrderId" = rr."restaurantOrderId"
INNER JOIN "restaurant_inventory_consumptions" ric
  ON ric."workspaceId" = rri."workspaceId"
 AND ric."restaurantOrderId" = rr."restaurantOrderId"
 AND ric."restaurantOrderItemId" = rri."restaurantOrderItemId"
WHERE rri."restocked" = true
  AND ROUND(ric."quantity" * (ABS(rri."quantity") / roi."quantity"), 4) > 0
ON CONFLICT ("restaurantReturnItemId", "productId") DO NOTHING;

CREATE OR REPLACE FUNCTION enforce_restaurant_return_inventory_movement_parent()
RETURNS trigger AS $$
DECLARE
  parent_workspace uuid;
  parent_return uuid;
  parent_order_item uuid;
  parent_reversal boolean;
  parent_order uuid;
BEGIN
  SELECT rri."workspaceId", rri."restaurantReturnId", rri."restaurantOrderItemId", rri."isReversal", rr."restaurantOrderId"
    INTO parent_workspace, parent_return, parent_order_item, parent_reversal, parent_order
  FROM "restaurant_return_items" rri
  INNER JOIN "restaurant_returns" rr ON rr."id" = rri."restaurantReturnId"
  WHERE rri."id" = NEW."restaurantReturnItemId";

  IF parent_workspace IS NULL
     OR parent_workspace IS DISTINCT FROM NEW."workspaceId"
     OR parent_return IS DISTINCT FROM NEW."restaurantReturnId"
     OR parent_order_item IS DISTINCT FROM NEW."restaurantOrderItemId" THEN
    RAISE EXCEPTION 'Restaurant return inventory movement parent is invalid';
  END IF;

  IF (NOT parent_reversal AND NEW."quantity" <= 0)
     OR (parent_reversal AND NEW."quantity" >= 0) THEN
    RAISE EXCEPTION 'Restaurant return inventory movement polarity mismatch';
  END IF;

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

CREATE TRIGGER "restaurant_return_inventory_movements_parent_guard"
BEFORE INSERT OR UPDATE ON "restaurant_return_inventory_movements"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_inventory_movement_parent();

CREATE OR REPLACE FUNCTION enforce_restaurant_return_inventory_movement_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Restaurant return inventory movement snapshot is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "restaurant_return_inventory_movements_immutable_update"
BEFORE UPDATE ON "restaurant_return_inventory_movements"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_inventory_movement_immutable();

CREATE TRIGGER "restaurant_return_inventory_movements_immutable_delete"
BEFORE DELETE ON "restaurant_return_inventory_movements"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_inventory_movement_immutable();
