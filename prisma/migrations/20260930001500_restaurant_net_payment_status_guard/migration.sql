-- V1.3 updates the existing payment-status invariant so item returns become part
-- of the authoritative derived state. The guard still rejects arbitrary status writes.

CREATE OR REPLACE FUNCTION enforce_restaurant_payment_status_derived()
RETURNS trigger AS $$
DECLARE
  adjusted_total numeric(15,2);
  retained_paid numeric(15,2);
  expected_status text;
BEGIN
  SELECT GREATEST(NEW."total" - COALESCE((
    SELECT SUM(rr."total")
    FROM "restaurant_returns" rr
    WHERE rr."workspaceId" = NEW."workspaceId"
      AND rr."restaurantOrderId" = NEW."id"
  ), 0), 0)
  INTO adjusted_total;

  SELECT GREATEST(
    COALESCE(SUM(rp."amount"), 0) - COALESCE((
      SELECT SUM(a."amount")
      FROM "restaurant_return_payment_allocations" a
      INNER JOIN "restaurant_payments" allocated_payment
        ON allocated_payment."id" = a."restaurantPaymentId"
      WHERE a."workspaceId" = NEW."workspaceId"
        AND allocated_payment."restaurantOrderId" = NEW."id"
        AND allocated_payment."voidedAt" IS NULL
    ), 0),
    0
  )
  INTO retained_paid
  FROM "restaurant_payments" rp
  WHERE rp."workspaceId" = NEW."workspaceId"
    AND rp."restaurantOrderId" = NEW."id"
    AND rp."voidedAt" IS NULL;

  expected_status := CASE
    WHEN adjusted_total <= 0 THEN 'PAID'
    WHEN retained_paid <= 0 THEN 'UNPAID'
    WHEN retained_paid >= adjusted_total THEN 'PAID'
    ELSE 'PARTIALLY_PAID'
  END;

  IF NEW."paymentStatus"::text <> expected_status THEN
    RAISE EXCEPTION 'Restaurant payment status must be derived from active payments and returns';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
