-- Restaurant V1.82: table release is a settlement boundary, not a kitchen boundary.
--
-- Live orders always retain occupancy. A completed order also retains occupancy
-- while its net payable balance is still outstanding. The existing KOT terminal
-- release trigger can continue attempting AVAILABLE; this guard fails closed
-- until authoritative order/payment/return state says the table can be released.

CREATE OR REPLACE FUNCTION restaurant_table_has_occupancy_blocker(
  table_id uuid,
  expected_workspace uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "restaurant_orders" ro
    WHERE ro."workspaceId" = expected_workspace
      AND ro."restaurantTableId" = table_id
      AND (
        ro."status" IN ('PENDING_REVIEW','CONFIRMED','PREPARING','READY')
        OR (
          ro."status" = 'COMPLETED'
          AND GREATEST(
            ro."total" - COALESCE((
              SELECT SUM(rr."total")
              FROM "restaurant_returns" rr
              WHERE rr."workspaceId" = ro."workspaceId"
                AND rr."restaurantOrderId" = ro."id"
            ), 0),
            0
          ) > GREATEST(
            COALESCE((
              SELECT SUM(rp."amount")
              FROM "restaurant_payments" rp
              WHERE rp."workspaceId" = ro."workspaceId"
                AND rp."restaurantOrderId" = ro."id"
                AND rp."voidedAt" IS NULL
            ), 0)
            - COALESCE((
              SELECT SUM(a."amount")
              FROM "restaurant_return_payment_allocations" a
              INNER JOIN "restaurant_payments" allocated_payment
                ON allocated_payment."id" = a."restaurantPaymentId"
               AND allocated_payment."workspaceId" = a."workspaceId"
              WHERE a."workspaceId" = ro."workspaceId"
                AND allocated_payment."restaurantOrderId" = ro."id"
                AND allocated_payment."voidedAt" IS NULL
            ), 0),
            0
          )
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM "kitchen_tickets" kt
    WHERE kt."workspaceId" = expected_workspace
      AND kt."restaurantTableId" = table_id
      AND kt."restaurantOrderId" IS NULL
      AND kt."status" NOT IN ('SERVED','CANCELLED')
  );
$$;

CREATE OR REPLACE FUNCTION preserve_restaurant_table_occupancy()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'AVAILABLE'
     AND OLD."status" = 'OCCUPIED'
     AND restaurant_table_has_occupancy_blocker(NEW."id", NEW."workspaceId") THEN
    NEW."status" := 'OCCUPIED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_tables_preserve_occupancy" ON "restaurant_tables";
CREATE TRIGGER "restaurant_tables_preserve_occupancy"
BEFORE UPDATE OF "status"
ON "restaurant_tables"
FOR EACH ROW EXECUTE FUNCTION preserve_restaurant_table_occupancy();
