-- Once a restaurant order has a KOT, its fulfillment/table routing has already
-- been materialized into kitchen and table operational state. Rewriting the order
-- routing independently would make those records disagree. Pending intake remains
-- editable before KOT creation so staff can correct WhatsApp routing during review.

CREATE OR REPLACE FUNCTION enforce_restaurant_order_routing_snapshot()
RETURNS trigger AS $$
BEGIN
  IF (NEW."fulfillmentType" IS DISTINCT FROM OLD."fulfillmentType"
      OR NEW."restaurantTableId" IS DISTINCT FROM OLD."restaurantTableId")
     AND EXISTS (
       SELECT 1
       FROM "kitchen_tickets" kt
       WHERE kt."workspaceId" = OLD."workspaceId"
         AND kt."restaurantOrderId" = OLD."id"
     ) THEN
    RAISE EXCEPTION 'Restaurant order routing is immutable after kitchen ticket creation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_routing_snapshot_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_routing_snapshot_guard"
BEFORE UPDATE OF "fulfillmentType", "restaurantTableId"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_routing_snapshot();
