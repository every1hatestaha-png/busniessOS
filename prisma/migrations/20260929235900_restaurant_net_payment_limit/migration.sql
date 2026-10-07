-- Prevent any payment path from collecting more than the order's net amount after item returns.
-- This is a database boundary, so stale UI or future API callers cannot bypass it.

CREATE OR REPLACE FUNCTION enforce_restaurant_net_payment_limit()
RETURNS trigger AS $$
DECLARE
  adjusted_due numeric(15,2);
  retained_paid numeric(15,2);
BEGIN
  SELECT GREATEST(
           ro."total" - COALESCE((
             SELECT SUM(rr."total")
             FROM "restaurant_returns" rr
             WHERE rr."workspaceId"=NEW."workspaceId"
               AND rr."restaurantOrderId"=NEW."restaurantOrderId"
           ), 0),
           0
         )::numeric(15,2)
    INTO adjusted_due
  FROM "restaurant_orders" ro
  WHERE ro."id"=NEW."restaurantOrderId"
    AND ro."workspaceId"=NEW."workspaceId";

  IF adjusted_due IS NULL THEN
    RAISE EXCEPTION 'Restaurant payment order reference is invalid';
  END IF;

  SELECT GREATEST(
           COALESCE(SUM(rp."amount") FILTER (WHERE rp."voidedAt" IS NULL), 0)
           - COALESCE((
             SELECT SUM(rrpa."amount")
             FROM "restaurant_return_payment_allocations" rrpa
             INNER JOIN "restaurant_payments" rp2
               ON rp2."id"=rrpa."restaurantPaymentId"
              AND rp2."workspaceId"=rrpa."workspaceId"
             WHERE rrpa."workspaceId"=NEW."workspaceId"
               AND rp2."restaurantOrderId"=NEW."restaurantOrderId"
               AND rp2."voidedAt" IS NULL
           ), 0),
           0
         )::numeric(15,2)
    INTO retained_paid
  FROM "restaurant_payments" rp
  WHERE rp."workspaceId"=NEW."workspaceId"
    AND rp."restaurantOrderId"=NEW."restaurantOrderId";

  IF retained_paid > adjusted_due THEN
    RAISE EXCEPTION 'Restaurant payment exceeds net outstanding balance after returns';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_payments_net_limit_guard" ON "restaurant_payments";
CREATE CONSTRAINT TRIGGER "restaurant_payments_net_limit_guard"
AFTER INSERT OR UPDATE OF "amount", "voidedAt", "restaurantOrderId", "workspaceId"
ON "restaurant_payments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_net_payment_limit();
