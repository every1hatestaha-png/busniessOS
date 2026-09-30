-- A full restaurant refund reverses the original receipt in full. Once any net
-- item-return allocation has already refunded part of that payment, allowing a
-- full refund would refund the same money twice. Serialize this boundary on the
-- payment row so concurrent item-return and full-refund workflows cannot both
-- commit contradictory financial history.
CREATE OR REPLACE FUNCTION enforce_restaurant_refund_return_allocation_guard()
RETURNS trigger AS $$
DECLARE
  net_return_allocated numeric(15,2);
BEGIN
  -- Lock the referenced payment before inspecting allocations. Restaurant item
  -- returns lock this same payment before they create allocation rows, so the
  -- two financial reversal paths serialize even under concurrent requests.
  PERFORM 1
  FROM "restaurant_payments" rp
  WHERE rp."id"=NEW."restaurantPaymentId"
    AND rp."workspaceId"=NEW."workspaceId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant refund payment reference is invalid';
  END IF;

  SELECT COALESCE(SUM(rrpa."amount"), 0)::numeric(15,2)
    INTO net_return_allocated
  FROM "restaurant_return_payment_allocations" rrpa
  WHERE rrpa."workspaceId"=NEW."workspaceId"
    AND rrpa."restaurantPaymentId"=NEW."restaurantPaymentId";

  IF net_return_allocated > 0 THEN
    RAISE EXCEPTION 'Restaurant payment already has item-return refund allocations; full refund is blocked';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_refunds_return_allocation_guard" ON "restaurant_refunds";
CREATE TRIGGER "restaurant_refunds_return_allocation_guard"
BEFORE INSERT ON "restaurant_refunds"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_refund_return_allocation_guard();
