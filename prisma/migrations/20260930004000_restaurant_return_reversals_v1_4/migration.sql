-- Restaurant V1.4: immutable compensating reversals for posted item returns.
-- Original returns are never edited or deleted. Reversals are negative documents.

ALTER TABLE "restaurant_returns"
  ADD COLUMN IF NOT EXISTS "isReversal" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reversalOfId" uuid REFERENCES "restaurant_returns"("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "reversalReason" text;

CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_returns_one_reversal_per_return"
  ON "restaurant_returns"("workspaceId", "reversalOfId")
  WHERE "reversalOfId" IS NOT NULL;

ALTER TABLE "restaurant_return_items"
  ADD COLUMN IF NOT EXISTS "isReversal" boolean NOT NULL DEFAULT false;

ALTER TABLE "restaurant_return_payment_allocations"
  ADD COLUMN IF NOT EXISTS "isReversal" boolean NOT NULL DEFAULT false;

-- Replace positive-only checks with polarity-aware checks. Existing normal rows
-- remain positive. Only explicitly marked reversal rows may carry negatives.
ALTER TABLE "restaurant_returns" DROP CONSTRAINT IF EXISTS "restaurant_returns_subtotal_check";
ALTER TABLE "restaurant_returns" DROP CONSTRAINT IF EXISTS "restaurant_returns_discountAmount_check";
ALTER TABLE "restaurant_returns" DROP CONSTRAINT IF EXISTS "restaurant_returns_taxAmount_check";
ALTER TABLE "restaurant_returns" DROP CONSTRAINT IF EXISTS "restaurant_returns_total_check";
ALTER TABLE "restaurant_returns" DROP CONSTRAINT IF EXISTS "restaurant_returns_inventoryCost_check";

ALTER TABLE "restaurant_returns"
  ADD CONSTRAINT "restaurant_returns_subtotal_polarity_check"
    CHECK ((NOT "isReversal" AND "subtotal" >= 0) OR ("isReversal" AND "subtotal" <= 0)),
  ADD CONSTRAINT "restaurant_returns_discount_polarity_check"
    CHECK ((NOT "isReversal" AND "discountAmount" >= 0) OR ("isReversal" AND "discountAmount" <= 0)),
  ADD CONSTRAINT "restaurant_returns_tax_polarity_check"
    CHECK ((NOT "isReversal" AND "taxAmount" >= 0) OR ("isReversal" AND "taxAmount" <= 0)),
  ADD CONSTRAINT "restaurant_returns_total_polarity_check"
    CHECK ((NOT "isReversal" AND "total" > 0) OR ("isReversal" AND "total" < 0)),
  ADD CONSTRAINT "restaurant_returns_inventory_cost_polarity_check"
    CHECK ((NOT "isReversal" AND "inventoryCost" >= 0) OR ("isReversal" AND "inventoryCost" <= 0)),
  ADD CONSTRAINT "restaurant_returns_reversal_shape_check"
    CHECK ((NOT "isReversal" AND "reversalOfId" IS NULL) OR ("isReversal" AND "reversalOfId" IS NOT NULL AND char_length("reversalReason") BETWEEN 3 AND 500));

ALTER TABLE "restaurant_return_items" DROP CONSTRAINT IF EXISTS "restaurant_return_items_quantity_check";
ALTER TABLE "restaurant_return_items" DROP CONSTRAINT IF EXISTS "restaurant_return_items_subtotal_check";
ALTER TABLE "restaurant_return_items" DROP CONSTRAINT IF EXISTS "restaurant_return_items_discountAmount_check";
ALTER TABLE "restaurant_return_items" DROP CONSTRAINT IF EXISTS "restaurant_return_items_taxAmount_check";
ALTER TABLE "restaurant_return_items" DROP CONSTRAINT IF EXISTS "restaurant_return_items_total_check";
ALTER TABLE "restaurant_return_items" DROP CONSTRAINT IF EXISTS "restaurant_return_items_inventoryCost_check";

ALTER TABLE "restaurant_return_items"
  ADD CONSTRAINT "restaurant_return_items_quantity_polarity_check"
    CHECK ((NOT "isReversal" AND "quantity" > 0) OR ("isReversal" AND "quantity" < 0)),
  ADD CONSTRAINT "restaurant_return_items_subtotal_polarity_check"
    CHECK ((NOT "isReversal" AND "subtotal" >= 0) OR ("isReversal" AND "subtotal" <= 0)),
  ADD CONSTRAINT "restaurant_return_items_discount_polarity_check"
    CHECK ((NOT "isReversal" AND "discountAmount" >= 0) OR ("isReversal" AND "discountAmount" <= 0)),
  ADD CONSTRAINT "restaurant_return_items_tax_polarity_check"
    CHECK ((NOT "isReversal" AND "taxAmount" >= 0) OR ("isReversal" AND "taxAmount" <= 0)),
  ADD CONSTRAINT "restaurant_return_items_total_polarity_check"
    CHECK ((NOT "isReversal" AND "total" >= 0) OR ("isReversal" AND "total" <= 0)),
  ADD CONSTRAINT "restaurant_return_items_inventory_cost_polarity_check"
    CHECK ((NOT "isReversal" AND "inventoryCost" >= 0) OR ("isReversal" AND "inventoryCost" <= 0));

ALTER TABLE "restaurant_return_payment_allocations" DROP CONSTRAINT IF EXISTS "restaurant_return_payment_allocations_amount_check";
ALTER TABLE "restaurant_return_payment_allocations"
  ADD CONSTRAINT "restaurant_return_payment_allocations_amount_polarity_check"
    CHECK ((NOT "isReversal" AND "amount" > 0) OR ("isReversal" AND "amount" < 0));

-- Keep child reversal polarity identical to the parent document.
CREATE OR REPLACE FUNCTION enforce_restaurant_return_tenant_parents()
RETURNS trigger AS $$
DECLARE
  parent_workspace uuid;
  parent_order uuid;
  parent_reversal boolean;
BEGIN
  IF TG_TABLE_NAME = 'restaurant_returns' THEN
    SELECT ro."workspaceId" INTO parent_workspace
    FROM "restaurant_orders" ro WHERE ro."id" = NEW."restaurantOrderId";
    IF parent_workspace IS DISTINCT FROM NEW."workspaceId" THEN
      RAISE EXCEPTION 'Cross-workspace restaurant return order reference rejected';
    END IF;
    IF NEW."isReversal" AND NOT EXISTS (
      SELECT 1 FROM "restaurant_returns" original
      WHERE original."id"=NEW."reversalOfId"
        AND original."workspaceId"=NEW."workspaceId"
        AND original."restaurantOrderId"=NEW."restaurantOrderId"
        AND original."isReversal"=false
    ) THEN
      RAISE EXCEPTION 'Restaurant return reversal parent is invalid';
    END IF;
  ELSIF TG_TABLE_NAME = 'restaurant_return_items' THEN
    SELECT rr."workspaceId", rr."restaurantOrderId", rr."isReversal"
      INTO parent_workspace, parent_order, parent_reversal
    FROM "restaurant_returns" rr WHERE rr."id" = NEW."restaurantReturnId";
    IF parent_workspace IS DISTINCT FROM NEW."workspaceId" THEN
      RAISE EXCEPTION 'Cross-workspace restaurant return item parent rejected';
    END IF;
    IF NEW."isReversal" IS DISTINCT FROM parent_reversal THEN
      RAISE EXCEPTION 'Restaurant return item reversal polarity mismatch';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "restaurant_order_items" roi
      WHERE roi."id" = NEW."restaurantOrderItemId"
        AND roi."restaurantOrderId" = parent_order
    ) THEN
      RAISE EXCEPTION 'Restaurant return item does not belong to the returned order';
    END IF;
  ELSIF TG_TABLE_NAME = 'restaurant_return_payment_allocations' THEN
    SELECT rr."workspaceId", rr."restaurantOrderId", rr."isReversal"
      INTO parent_workspace, parent_order, parent_reversal
    FROM "restaurant_returns" rr WHERE rr."id" = NEW."restaurantReturnId";
    IF parent_workspace IS DISTINCT FROM NEW."workspaceId" THEN
      RAISE EXCEPTION 'Cross-workspace restaurant return payment allocation rejected';
    END IF;
    IF NEW."isReversal" IS DISTINCT FROM parent_reversal THEN
      RAISE EXCEPTION 'Restaurant return payment allocation reversal polarity mismatch';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "restaurant_payments" rp
      WHERE rp."id" = NEW."restaurantPaymentId"
        AND rp."workspaceId" = NEW."workspaceId"
        AND rp."restaurantOrderId" = parent_order
        AND rp."postedAt" IS NOT NULL
        AND rp."voidedAt" IS NULL
    ) THEN
      RAISE EXCEPTION 'Restaurant return payment is unavailable or belongs to another order';
    END IF;
    IF NOT NEW."isReversal" AND EXISTS (
      SELECT 1 FROM "restaurant_refunds" rf
      WHERE rf."workspaceId" = NEW."workspaceId"
        AND rf."restaurantPaymentId" = NEW."restaurantPaymentId"
    ) THEN
      RAISE EXCEPTION 'Restaurant payment already has a full refund';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A full payment refund is allowed again after all item-return allocations have
-- been fully compensated by reversal allocations.
CREATE OR REPLACE FUNCTION reject_full_refund_after_item_return()
RETURNS trigger AS $$
DECLARE
  net_allocated numeric(15,2);
BEGIN
  SELECT COALESCE(SUM(a."amount"), 0)::numeric(15,2)
    INTO net_allocated
  FROM "restaurant_return_payment_allocations" a
  WHERE a."workspaceId" = NEW."workspaceId"
    AND a."restaurantPaymentId" = NEW."restaurantPaymentId";

  IF net_allocated > 0 THEN
    RAISE EXCEPTION 'Restaurant payment already has item-return refund allocations';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
