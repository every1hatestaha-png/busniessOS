-- V1.4 already made the full-refund guard reversal-aware by checking the net
-- item-return allocation. V1.30 keeps that single canonical trigger/function
-- and upgrades it with payment-row locking so concurrent item-return and full
-- refund workflows serialize on the same financial parent.
CREATE OR REPLACE FUNCTION reject_full_refund_after_item_return()
RETURNS trigger AS $$
DECLARE
  net_allocated numeric(15,2);
BEGIN
  -- Restaurant item returns lock the order and then the selected payment before
  -- writing allocation rows. Refund service code now follows the same
  -- order->payment lock order. This trigger keeps direct SQL refund inserts on
  -- the same payment serialization boundary as a final database-level defense.
  PERFORM 1
  FROM "restaurant_payments" rp
  WHERE rp."id"=NEW."restaurantPaymentId"
    AND rp."workspaceId"=NEW."workspaceId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant refund payment reference is invalid';
  END IF;

  SELECT COALESCE(SUM(a."amount"), 0)::numeric(15,2)
    INTO net_allocated
  FROM "restaurant_return_payment_allocations" a
  WHERE a."workspaceId"=NEW."workspaceId"
    AND a."restaurantPaymentId"=NEW."restaurantPaymentId";

  IF net_allocated > 0 THEN
    RAISE EXCEPTION 'Restaurant payment already has item-return refund allocations';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
