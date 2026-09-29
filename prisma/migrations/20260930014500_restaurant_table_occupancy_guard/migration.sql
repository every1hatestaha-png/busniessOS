-- A table cannot become AVAILABLE while either restaurant-native orders or
-- legacy compatibility kitchen tickets are still live on that table.

CREATE OR REPLACE FUNCTION preserve_restaurant_table_occupancy()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'AVAILABLE' AND OLD."status" = 'OCCUPIED' THEN
    IF EXISTS (
      SELECT 1 FROM "restaurant_orders" ro
      WHERE ro."workspaceId" = NEW."workspaceId"
        AND ro."restaurantTableId" = NEW."id"
        AND ro."status" IN ('PENDING_REVIEW','CONFIRMED','PREPARING','READY')
    ) OR EXISTS (
      SELECT 1 FROM "kitchen_tickets" kt
      WHERE kt."workspaceId" = NEW."workspaceId"
        AND kt."restaurantTableId" = NEW."id"
        AND kt."restaurantOrderId" IS NULL
        AND kt."status" NOT IN ('SERVED','CANCELLED')
    ) THEN
      NEW."status" := 'OCCUPIED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_tables_preserve_occupancy" ON "restaurant_tables";
CREATE TRIGGER "restaurant_tables_preserve_occupancy"
BEFORE UPDATE OF "status"
ON "restaurant_tables"
FOR EACH ROW EXECUTE FUNCTION preserve_restaurant_table_occupancy();
