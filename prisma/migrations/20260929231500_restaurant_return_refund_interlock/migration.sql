-- Prevent an economic double refund across V1.2 full-payment refunds and V1.3 item returns.

CREATE OR REPLACE FUNCTION enforce_restaurant_full_refund_interlock()
RETURNS trigger AS $$
DECLARE
  prior_item_refunds numeric(15,2);
BEGIN
  SELECT COALESCE(SUM(rir."refundAmount"), 0)::numeric(15,2)
    INTO prior_item_refunds
  FROM "restaurant_item_returns" rir
  WHERE rir."workspaceId" = NEW."workspaceId"
    AND rir."restaurantOrderId" = NEW."restaurantOrderId";

  IF prior_item_refunds > 0 THEN
    RAISE EXCEPTION 'Full restaurant payment refund blocked after item-level cash refunds; use the item return flow for remaining value';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_refunds_item_return_interlock" ON "restaurant_refunds";
CREATE TRIGGER "restaurant_refunds_item_return_interlock"
BEFORE INSERT ON "restaurant_refunds"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_full_refund_interlock();
