-- Restaurant V1.82: table release is a settlement boundary, not a kitchen boundary.
--
-- Live orders always retain occupancy. A completed order retains occupancy while
-- its net payable balance is outstanding, but only until the table is actually
-- released. That release is snapshotted so later post-service refunds or return
-- reversals cannot make an old order poison a future seating on the same table.

ALTER TABLE "restaurant_orders"
  ADD COLUMN IF NOT EXISTS "tableReleasedAt" timestamptz;

-- Before V1.82, COMPLETED was itself the table-release boundary. Preserve that
-- historical meaning for pre-migration rows instead of retroactively trapping
-- tables because an old completed order was later refunded.
UPDATE "restaurant_orders"
SET "tableReleasedAt" = COALESCE("completedAt", "updatedAt", "createdAt", now())
WHERE "status" = 'COMPLETED'
  AND "tableReleasedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "restaurant_orders_table_settlement_idx"
  ON "restaurant_orders" ("workspaceId", "restaurantTableId", "status", "tableReleasedAt")
  WHERE "restaurantTableId" IS NOT NULL;

CREATE OR REPLACE FUNCTION restaurant_order_net_outstanding(
  order_id uuid,
  expected_workspace uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(
    GREATEST(
      ro."total" - COALESCE((
        SELECT SUM(rr."total")
        FROM "restaurant_returns" rr
        WHERE rr."workspaceId" = ro."workspaceId"
          AND rr."restaurantOrderId" = ro."id"
      ), 0),
      0
    )
    - GREATEST(
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
    ),
    0
  )
  FROM "restaurant_orders" ro
  WHERE ro."id" = order_id
    AND ro."workspaceId" = expected_workspace;
$$;

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
          AND ro."tableReleasedAt" IS NULL
          AND COALESCE(restaurant_order_net_outstanding(ro."id", ro."workspaceId"), ro."total") > 0
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

CREATE OR REPLACE FUNCTION enforce_restaurant_order_table_release_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."tableReleasedAt" IS NOT NULL
     AND NEW."tableReleasedAt" IS DISTINCT FROM OLD."tableReleasedAt" THEN
    RAISE EXCEPTION 'Restaurant table release evidence is immutable once recorded';
  END IF;

  IF OLD."tableReleasedAt" IS NULL AND NEW."tableReleasedAt" IS NOT NULL THEN
    IF NEW."status" <> 'COMPLETED' OR NEW."restaurantTableId" IS NULL THEN
      RAISE EXCEPTION 'Restaurant table release evidence requires a completed dine-in order';
    END IF;
    IF COALESCE(restaurant_order_net_outstanding(NEW."id", NEW."workspaceId"), NEW."total") > 0 THEN
      RAISE EXCEPTION 'Restaurant table cannot be released before financial settlement';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "restaurant_orders_table_release_snapshot_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_table_release_snapshot_guard"
BEFORE UPDATE OF "tableReleasedAt"
ON "restaurant_orders"
FOR EACH ROW
EXECUTE FUNCTION enforce_restaurant_order_table_release_snapshot();

CREATE OR REPLACE FUNCTION preserve_restaurant_table_occupancy()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'AVAILABLE' AND OLD."status" = 'OCCUPIED' THEN
    IF restaurant_table_has_occupancy_blocker(NEW."id", NEW."workspaceId") THEN
      NEW."status" := 'OCCUPIED';
    ELSE
      -- Persist the release boundary before the table becomes reusable. This
      -- prevents a later refund on a historical order from blocking a new party.
      UPDATE "restaurant_orders"
      SET "tableReleasedAt" = COALESCE("tableReleasedAt", now())
      WHERE "workspaceId" = NEW."workspaceId"
        AND "restaurantTableId" = NEW."id"
        AND "status" = 'COMPLETED'
        AND "tableReleasedAt" IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_tables_preserve_occupancy" ON "restaurant_tables";
CREATE TRIGGER "restaurant_tables_preserve_occupancy"
BEFORE UPDATE OF "status"
ON "restaurant_tables"
FOR EACH ROW EXECUTE FUNCTION preserve_restaurant_table_occupancy();
