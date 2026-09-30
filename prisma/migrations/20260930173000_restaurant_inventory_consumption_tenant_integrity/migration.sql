-- Historical restaurant inventory consumption rows drive future restocking and
-- compensating reversal behavior. Every inserted snapshot must be anchored to
-- the same tenant across its order, order item, product, and optional warehouse.
-- V1.34 already freezes rows after insert; this closes cross-tenant/foreign-parent
-- insertion paths without changing the legitimate completion-time snapshot flow.

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

  IF NOT EXISTS (
    SELECT 1
    FROM "products" p
    WHERE p."id" = NEW."productId"
      AND p."workspaceId" = NEW."workspaceId"::text
  ) THEN
    RAISE EXCEPTION 'Restaurant inventory consumption product belongs to another workspace';
  END IF;

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

DROP TRIGGER IF EXISTS "restaurant_inventory_consumptions_tenant_integrity"
  ON "restaurant_inventory_consumptions";
CREATE TRIGGER "restaurant_inventory_consumptions_tenant_integrity"
BEFORE INSERT ON "restaurant_inventory_consumptions"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_inventory_consumption_tenant_integrity();
