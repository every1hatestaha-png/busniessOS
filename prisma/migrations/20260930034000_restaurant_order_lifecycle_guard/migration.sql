-- Restaurant order status is a financial and inventory lifecycle boundary.
-- Enforce the transition graph in PostgreSQL so future callers cannot bypass
-- the hardened service layer.

CREATE OR REPLACE FUNCTION enforce_restaurant_order_lifecycle()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."status" = 'PENDING_REVIEW' AND NEW."status" IN ('CONFIRMED','CANCELLED')) OR
    (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('PREPARING','CANCELLED')) OR
    (OLD."status" = 'PREPARING' AND NEW."status" IN ('READY','CANCELLED')) OR
    (OLD."status" = 'READY' AND NEW."status" IN ('COMPLETED','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid restaurant order status transition from % to %', OLD."status", NEW."status";
  END IF;

  IF NEW."status" = 'COMPLETED' THEN
    IF NEW."inventoryPostedAt" IS NULL OR NEW."accountingPostedAt" IS NULL THEN
      RAISE EXCEPTION 'Restaurant order cannot complete before inventory and accounting are posted';
    END IF;
    IF NEW."completedAt" IS NULL THEN
      RAISE EXCEPTION 'Completed restaurant order requires completedAt';
    END IF;
  END IF;

  IF NEW."status" = 'CANCELLED' THEN
    IF NEW."inventoryPostedAt" IS NOT NULL OR NEW."accountingPostedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Posted restaurant order cannot be cancelled without a reversal workflow';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM "restaurant_payments" rp
      WHERE rp."workspaceId" = NEW."workspaceId"
        AND rp."restaurantOrderId" = NEW."id"
        AND rp."voidedAt" IS NULL
        AND rp."amount" > 0
    ) THEN
      RAISE EXCEPTION 'Restaurant order cannot be cancelled while active payments exist';
    END IF;
    IF NEW."cancelledAt" IS NULL THEN
      RAISE EXCEPTION 'Cancelled restaurant order requires cancelledAt';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_lifecycle_guard" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_lifecycle_guard"
BEFORE UPDATE OF "status"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_order_lifecycle();
