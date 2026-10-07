-- Historical consumption snapshots belong to a specific restaurant order item.
-- If an order item is physically removed by an authorized parent cleanup, the
-- child snapshot must follow it. Normal completed-order workflows never delete
-- order items, so return integrity remains protected while test and tenant purge
-- routines preserve valid FK ordering.

ALTER TABLE "restaurant_inventory_consumptions"
  DROP CONSTRAINT IF EXISTS "restaurant_inventory_consumptions_restaurantOrderItemId_fkey";

ALTER TABLE "restaurant_inventory_consumptions"
  ADD CONSTRAINT "restaurant_inventory_consumptions_restaurantOrderItemId_fkey"
  FOREIGN KEY ("restaurantOrderItemId")
  REFERENCES "restaurant_order_items"("id")
  ON DELETE CASCADE;
