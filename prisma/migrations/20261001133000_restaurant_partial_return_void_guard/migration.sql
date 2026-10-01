-- A full receipt void cannot discard a partially refunded allocation balance.
-- Full item-return auto-void remains valid and is protected by existing return
-- conservation and immutable payment-evidence guards.
CREATE OR REPLACE FUNCTION reject_restaurant_void_after_partial_return()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allocated numeric;
BEGIN
  IF OLD."voidedAt" IS NULL AND NEW."voidedAt" IS NOT NULL THEN
    SELECT COALESCE(SUM(a."amount"), 0) INTO allocated
    FROM "restaurant_return_payment_allocations" a
    WHERE a."workspaceId" = NEW."workspaceId" AND a."restaurantPaymentId" = NEW."id";
    IF allocated > 0 AND allocated < NEW."amount" THEN
      RAISE EXCEPTION 'Restaurant payment has partial item-return refund allocations; reverse them before voiding';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "restaurant_payments_partial_return_void_guard"
BEFORE UPDATE OF "voidedAt" ON "restaurant_payments"
FOR EACH ROW EXECUTE FUNCTION reject_restaurant_void_after_partial_return();
