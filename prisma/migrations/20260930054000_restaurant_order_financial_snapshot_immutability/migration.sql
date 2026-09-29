-- Restaurant order financial values are priced once at creation time.
-- Later payment, return, lifecycle, and accounting workflows derive from this
-- immutable snapshot. Direct changes would detach the order from posted GL and
-- inventory history.

CREATE OR REPLACE FUNCTION enforce_restaurant_order_financial_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     OR NEW."discountAmount" IS DISTINCT FROM OLD."discountAmount"
     OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
     OR NEW."total" IS DISTINCT FROM OLD."total" THEN
    RAISE EXCEPTION 'Restaurant order financial snapshot is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_financial_snapshot_immutable" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_financial_snapshot_immutable"
BEFORE UPDATE OF "subtotal", "discountAmount", "taxAmount", "total"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_financial_snapshot_immutable();