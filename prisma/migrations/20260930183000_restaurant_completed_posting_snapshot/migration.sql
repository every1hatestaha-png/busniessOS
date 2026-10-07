-- A completed restaurant order is posted financial/inventory history. The
-- completion workflow legitimately initializes inventoryPostedAt,
-- accountingPostedAt, and inventoryCost while the order is still READY, then
-- marks it COMPLETED with completedAt in the same serializable transaction.
-- Once that transaction commits, those posting markers/costs must never be
-- rewritten in place. Corrections belong in compensating return/refund flows.

CREATE OR REPLACE FUNCTION enforce_restaurant_completed_posting_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'COMPLETED' AND (
    NEW."inventoryPostedAt" IS DISTINCT FROM OLD."inventoryPostedAt"
    OR NEW."accountingPostedAt" IS DISTINCT FROM OLD."accountingPostedAt"
    OR NEW."inventoryCost" IS DISTINCT FROM OLD."inventoryCost"
    OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
  ) THEN
    RAISE EXCEPTION 'Restaurant completed posting snapshot is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_completed_posting_snapshot_guard"
  ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_completed_posting_snapshot_guard"
BEFORE UPDATE OF "inventoryPostedAt", "accountingPostedAt", "inventoryCost", "completedAt"
ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_completed_posting_snapshot_immutable();
