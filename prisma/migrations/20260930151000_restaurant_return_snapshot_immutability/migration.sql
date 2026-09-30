-- Posted restaurant returns are financial and inventory history. Corrections use
-- explicit compensating reversal documents, never in-place mutation. Preserve
-- the original return, item lines, and payment-allocation snapshots exactly as
-- inserted while still allowing harmless no-op UPDATE statements.

CREATE OR REPLACE FUNCTION enforce_restaurant_return_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."restaurantOrderId" IS DISTINCT FROM OLD."restaurantOrderId"
     OR NEW."returnNumber" IS DISTINCT FROM OLD."returnNumber"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     OR NEW."discountAmount" IS DISTINCT FROM OLD."discountAmount"
     OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
     OR NEW."total" IS DISTINCT FROM OLD."total"
     OR NEW."inventoryCost" IS DISTINCT FROM OLD."inventoryCost"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."requestFingerprint" IS DISTINCT FROM OLD."requestFingerprint"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."isReversal" IS DISTINCT FROM OLD."isReversal"
     OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId"
     OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason" THEN
    RAISE EXCEPTION 'Restaurant return snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_returns_snapshot_immutable" ON "restaurant_returns";
CREATE TRIGGER "restaurant_returns_snapshot_immutable"
BEFORE UPDATE ON "restaurant_returns"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_snapshot_immutable();

CREATE OR REPLACE FUNCTION enforce_restaurant_return_item_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."restaurantReturnId" IS DISTINCT FROM OLD."restaurantReturnId"
     OR NEW."restaurantOrderItemId" IS DISTINCT FROM OLD."restaurantOrderItemId"
     OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
     OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     OR NEW."discountAmount" IS DISTINCT FROM OLD."discountAmount"
     OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
     OR NEW."total" IS DISTINCT FROM OLD."total"
     OR NEW."inventoryCost" IS DISTINCT FROM OLD."inventoryCost"
     OR NEW."restocked" IS DISTINCT FROM OLD."restocked"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."isReversal" IS DISTINCT FROM OLD."isReversal" THEN
    RAISE EXCEPTION 'Restaurant return item snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_return_items_snapshot_immutable" ON "restaurant_return_items";
CREATE TRIGGER "restaurant_return_items_snapshot_immutable"
BEFORE UPDATE ON "restaurant_return_items"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_item_snapshot_immutable();

CREATE OR REPLACE FUNCTION enforce_restaurant_return_allocation_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."restaurantReturnId" IS DISTINCT FROM OLD."restaurantReturnId"
     OR NEW."restaurantPaymentId" IS DISTINCT FROM OLD."restaurantPaymentId"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."isReversal" IS DISTINCT FROM OLD."isReversal" THEN
    RAISE EXCEPTION 'Restaurant return payment allocation snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_return_allocations_snapshot_immutable" ON "restaurant_return_payment_allocations";
CREATE TRIGGER "restaurant_return_allocations_snapshot_immutable"
BEFORE UPDATE ON "restaurant_return_payment_allocations"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_allocation_snapshot_immutable();
