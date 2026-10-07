-- Historical restaurant inventory consumption is the authoritative basis for
-- later item-return restocking and return-reversal re-consumption. Once captured
-- at order completion, its tenant, parent identities, product/warehouse mapping,
-- quantity, unit cost, and timestamp must never be rewritten in place.

CREATE OR REPLACE FUNCTION enforce_restaurant_inventory_consumption_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
     OR NEW."restaurantOrderItemId" IS DISTINCT FROM OLD."restaurantOrderItemId"
     OR NEW."productId" IS DISTINCT FROM OLD."productId"
     OR NEW."warehouseId" IS DISTINCT FROM OLD."warehouseId"
     OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
     OR NEW."unitCost" IS DISTINCT FROM OLD."unitCost"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Restaurant inventory consumption snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_inventory_consumptions_snapshot_immutable"
  ON "restaurant_inventory_consumptions";
CREATE TRIGGER "restaurant_inventory_consumptions_snapshot_immutable"
BEFORE UPDATE ON "restaurant_inventory_consumptions"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_inventory_consumption_snapshot_immutable();
