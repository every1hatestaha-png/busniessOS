-- V1.3 follow-up: a fully returned order has zero adjusted due and is settled.
-- Keep the function replacement additive and migration-safe.

CREATE OR REPLACE FUNCTION sync_restaurant_net_payment_status()
RETURNS trigger AS $$
DECLARE
  target_order uuid;
  target_workspace uuid;
  adjusted_total numeric(15,2);
  retained_paid numeric(15,2);
  next_status text;
BEGIN
  IF TG_TABLE_NAME = 'restaurant_returns' THEN
    target_order := NEW."restaurantOrderId";
    target_workspace := NEW."workspaceId";
  ELSIF TG_TABLE_NAME = 'restaurant_return_payment_allocations' THEN
    SELECT rr."restaurantOrderId", rr."workspaceId"
      INTO target_order, target_workspace
    FROM "restaurant_returns" rr WHERE rr."id" = NEW."restaurantReturnId";
  ELSIF TG_TABLE_NAME = 'restaurant_refunds' THEN
    target_order := NEW."restaurantOrderId";
    target_workspace := NEW."workspaceId";
  ELSE
    target_order := NEW."restaurantOrderId";
    target_workspace := NEW."workspaceId";
  END IF;

  SELECT GREATEST(ro."total" - COALESCE((
    SELECT SUM(rr."total") FROM "restaurant_returns" rr
    WHERE rr."workspaceId" = target_workspace
      AND rr."restaurantOrderId" = target_order
  ), 0), 0)
  INTO adjusted_total
  FROM "restaurant_orders" ro
  WHERE ro."id" = target_order AND ro."workspaceId" = target_workspace;

  SELECT GREATEST(
    COALESCE(SUM(rp."amount"), 0) - COALESCE((
      SELECT SUM(a."amount")
      FROM "restaurant_return_payment_allocations" a
      INNER JOIN "restaurant_payments" p ON p."id" = a."restaurantPaymentId"
      WHERE a."workspaceId" = target_workspace
        AND p."restaurantOrderId" = target_order
        AND p."voidedAt" IS NULL
    ), 0),
    0
  )
  INTO retained_paid
  FROM "restaurant_payments" rp
  WHERE rp."workspaceId" = target_workspace
    AND rp."restaurantOrderId" = target_order
    AND rp."voidedAt" IS NULL;

  next_status := CASE
    WHEN adjusted_total <= 0 THEN 'PAID'
    WHEN retained_paid <= 0 THEN 'UNPAID'
    WHEN retained_paid >= adjusted_total THEN 'PAID'
    ELSE 'PARTIALLY_PAID'
  END;

  UPDATE "restaurant_orders"
  SET "paymentStatus" = next_status, "updatedAt" = now()
  WHERE "id" = target_order AND "workspaceId" = target_workspace;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
