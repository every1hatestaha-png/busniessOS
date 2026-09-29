-- Restaurant payment status is derived financial state.
-- Normalize any pre-V1.1 manual state, then reject direct or stale mutations
-- that do not match active payment rows.

UPDATE "restaurant_orders" ro
SET "paymentStatus" = CASE
  WHEN paid.active_paid <= 0 THEN 'UNPAID'
  WHEN paid.active_paid >= ro."total" THEN 'PAID'
  ELSE 'PARTIALLY_PAID'
END,
"updatedAt" = now()
FROM (
  SELECT ro2."id",
         COALESCE(SUM(rp."amount") FILTER (WHERE rp."voidedAt" IS NULL), 0)::numeric(15,2) AS active_paid
  FROM "restaurant_orders" ro2
  LEFT JOIN "restaurant_payments" rp
    ON rp."workspaceId" = ro2."workspaceId"
   AND rp."restaurantOrderId" = ro2."id"
  GROUP BY ro2."id"
) paid
WHERE paid."id" = ro."id"
  AND ro."paymentStatus"::text <> CASE
    WHEN paid.active_paid <= 0 THEN 'UNPAID'
    WHEN paid.active_paid >= ro."total" THEN 'PAID'
    ELSE 'PARTIALLY_PAID'
  END;

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_status_derived()
RETURNS trigger AS $$
DECLARE
  active_paid numeric(15,2);
  expected_status text;
BEGIN
  SELECT COALESCE(SUM(rp."amount"), 0)::numeric(15,2)
    INTO active_paid
  FROM "restaurant_payments" rp
  WHERE rp."workspaceId" = NEW."workspaceId"
    AND rp."restaurantOrderId" = NEW."id"
    AND rp."voidedAt" IS NULL;

  expected_status := CASE
    WHEN active_paid <= 0 THEN 'UNPAID'
    WHEN active_paid >= NEW."total" THEN 'PAID'
    ELSE 'PARTIALLY_PAID'
  END;

  IF NEW."paymentStatus"::text <> expected_status THEN
    RAISE EXCEPTION 'Restaurant payment status must be derived from active payments';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_payment_status_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_payment_status_guard"
BEFORE INSERT OR UPDATE OF "paymentStatus", "total"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_payment_status_derived();
