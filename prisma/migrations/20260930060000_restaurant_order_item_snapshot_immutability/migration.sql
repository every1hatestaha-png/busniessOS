-- Restaurant order lines are historical snapshots used by inventory, returns,
-- kitchen flow, and financial reconciliation. Silent UPDATE mutations would
-- detach those workflows from the original priced order.

CREATE OR REPLACE FUNCTION enforce_restaurant_order_item_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
     OR NEW."menuItemId" IS DISTINCT FROM OLD."menuItemId"
     OR NEW."itemName" IS DISTINCT FROM OLD."itemName"
     OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
     OR NEW."unitPrice" IS DISTINCT FROM OLD."unitPrice"
     OR NEW."lineTotal" IS DISTINCT FROM OLD."lineTotal"
     OR NEW."modifiers" IS DISTINCT FROM OLD."modifiers" THEN
    RAISE EXCEPTION 'Restaurant order item snapshot is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_order_items_snapshot_immutable" ON "restaurant_order_items";
CREATE TRIGGER "restaurant_order_items_snapshot_immutable"
BEFORE UPDATE OF "restaurantOrderId", "menuItemId", "itemName", "quantity", "unitPrice", "lineTotal", "modifiers"
ON "restaurant_order_items"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_item_snapshot_immutable();