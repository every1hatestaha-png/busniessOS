-- Restaurant Workspace V1.3: item-level returns with historical inventory snapshots.
-- Additive and tenant-scoped. No production data is modified by this migration itself.

CREATE TABLE IF NOT EXISTS "restaurant_inventory_consumptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "restaurantOrderId" uuid NOT NULL REFERENCES "restaurant_orders"("id") ON DELETE RESTRICT,
  "restaurantOrderItemId" uuid NOT NULL REFERENCES "restaurant_order_items"("id") ON DELETE RESTRICT,
  "productId" text NOT NULL,
  "warehouseId" uuid REFERENCES "warehouses"("id") ON DELETE RESTRICT,
  "quantity" numeric(15,4) NOT NULL CHECK ("quantity" > 0),
  "unitCost" numeric(15,2) NOT NULL CHECK ("unitCost" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "restaurant_inventory_consumptions_item_product_unique"
    UNIQUE ("restaurantOrderItemId", "productId")
);
CREATE INDEX IF NOT EXISTS "restaurant_inventory_consumptions_workspace_order_idx"
  ON "restaurant_inventory_consumptions"("workspaceId", "restaurantOrderId");

-- Capture the exact item-to-product consumption basis at completion time. This
-- executes in the same transaction that marks inventoryPostedAt, so later recipe
-- edits cannot change what an historical return restores.
CREATE OR REPLACE FUNCTION snapshot_restaurant_inventory_consumptions()
RETURNS trigger AS $$
DECLARE
  default_warehouse uuid;
BEGIN
  IF NEW."inventoryPostedAt" IS NULL OR OLD."inventoryPostedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT w."id" INTO default_warehouse
  FROM "warehouses" w
  WHERE w."workspaceId" = NEW."workspaceId"
    AND w."isActive" = true
    AND w."isDefault" = true
  LIMIT 1;

  -- Recipe-backed menu items. Preserve each ingredient quantity and cost.
  INSERT INTO "restaurant_inventory_consumptions" (
    "workspaceId", "restaurantOrderId", "restaurantOrderItemId",
    "productId", "warehouseId", "quantity", "unitCost"
  )
  SELECT
    NEW."workspaceId",
    NEW."id",
    roi."id",
    ri."ingredientProductId"::text,
    default_warehouse,
    ROUND((ri."quantity" * (roi."quantity" / r."yieldQuantity") *
      (1 + (ri."wastagePercent" / 100)))::numeric, 4),
    p."costPrice"
  FROM "restaurant_order_items" roi
  INNER JOIN "restaurant_menu_items" mi
    ON mi."id" = roi."menuItemId" AND mi."workspaceId" = NEW."workspaceId"
  INNER JOIN "recipes" r
    ON r."workspaceId" = NEW."workspaceId"
   AND r."finishedProductId"::text = mi."productId"
   AND r."isActive" = true
  INNER JOIN "recipe_items" ri ON ri."recipeId" = r."id"
  INNER JOIN "products" p
    ON p."id" = ri."ingredientProductId"::text
   AND p."workspaceId" = NEW."workspaceId"::text
  WHERE roi."restaurantOrderId" = NEW."id"
  ON CONFLICT ("restaurantOrderItemId", "productId") DO NOTHING;

  -- Direct product menu items with no active recipe consume the linked product.
  INSERT INTO "restaurant_inventory_consumptions" (
    "workspaceId", "restaurantOrderId", "restaurantOrderItemId",
    "productId", "warehouseId", "quantity", "unitCost"
  )
  SELECT
    NEW."workspaceId",
    NEW."id",
    roi."id",
    mi."productId",
    default_warehouse,
    roi."quantity",
    p."costPrice"
  FROM "restaurant_order_items" roi
  INNER JOIN "restaurant_menu_items" mi
    ON mi."id" = roi."menuItemId" AND mi."workspaceId" = NEW."workspaceId"
  INNER JOIN "products" p
    ON p."id" = mi."productId"
   AND p."workspaceId" = NEW."workspaceId"::text
  WHERE roi."restaurantOrderId" = NEW."id"
    AND mi."productId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "recipes" r
      WHERE r."workspaceId" = NEW."workspaceId"
        AND r."finishedProductId"::text = mi."productId"
        AND r."isActive" = true
    )
  ON CONFLICT ("restaurantOrderItemId", "productId") DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_orders_inventory_snapshot" ON "restaurant_orders";
CREATE TRIGGER "restaurant_orders_inventory_snapshot"
AFTER UPDATE OF "inventoryPostedAt" ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION snapshot_restaurant_inventory_consumptions();

CREATE TABLE IF NOT EXISTS "restaurant_returns" (
  "id" uuid PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "restaurantOrderId" uuid NOT NULL REFERENCES "restaurant_orders"("id") ON DELETE RESTRICT,
  "returnNumber" text NOT NULL,
  "reason" text NOT NULL CHECK (char_length("reason") BETWEEN 3 AND 500),
  "subtotal" numeric(15,2) NOT NULL CHECK ("subtotal" >= 0),
  "discountAmount" numeric(15,2) NOT NULL CHECK ("discountAmount" >= 0),
  "taxAmount" numeric(15,2) NOT NULL CHECK ("taxAmount" >= 0),
  "total" numeric(15,2) NOT NULL CHECK ("total" > 0),
  "inventoryCost" numeric(15,2) NOT NULL DEFAULT 0 CHECK ("inventoryCost" >= 0),
  "idempotencyKey" text,
  "requestFingerprint" text NOT NULL,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "restaurant_returns_workspace_number_unique" UNIQUE ("workspaceId", "returnNumber")
);
CREATE INDEX IF NOT EXISTS "restaurant_returns_workspace_order_idx"
  ON "restaurant_returns"("workspaceId", "restaurantOrderId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_returns_workspace_idempotency_unique"
  ON "restaurant_returns"("workspaceId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "restaurant_return_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "restaurantReturnId" uuid NOT NULL REFERENCES "restaurant_returns"("id") ON DELETE RESTRICT,
  "restaurantOrderItemId" uuid NOT NULL REFERENCES "restaurant_order_items"("id") ON DELETE RESTRICT,
  "quantity" numeric(15,4) NOT NULL CHECK ("quantity" > 0),
  "subtotal" numeric(15,2) NOT NULL CHECK ("subtotal" >= 0),
  "discountAmount" numeric(15,2) NOT NULL CHECK ("discountAmount" >= 0),
  "taxAmount" numeric(15,2) NOT NULL CHECK ("taxAmount" >= 0),
  "total" numeric(15,2) NOT NULL CHECK ("total" >= 0),
  "inventoryCost" numeric(15,2) NOT NULL DEFAULT 0 CHECK ("inventoryCost" >= 0),
  "restocked" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "restaurant_return_items_return_order_item_unique"
    UNIQUE ("restaurantReturnId", "restaurantOrderItemId")
);
CREATE INDEX IF NOT EXISTS "restaurant_return_items_workspace_order_item_idx"
  ON "restaurant_return_items"("workspaceId", "restaurantOrderItemId");

CREATE TABLE IF NOT EXISTS "restaurant_return_payment_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "restaurantReturnId" uuid NOT NULL REFERENCES "restaurant_returns"("id") ON DELETE RESTRICT,
  "restaurantPaymentId" uuid NOT NULL REFERENCES "restaurant_payments"("id") ON DELETE RESTRICT,
  "amount" numeric(15,2) NOT NULL CHECK ("amount" > 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "restaurant_return_payment_allocation_unique"
    UNIQUE ("restaurantReturnId", "restaurantPaymentId")
);
CREATE INDEX IF NOT EXISTS "restaurant_return_payment_allocations_workspace_payment_idx"
  ON "restaurant_return_payment_allocations"("workspaceId", "restaurantPaymentId");

CREATE OR REPLACE FUNCTION enforce_restaurant_return_tenant_parents()
RETURNS trigger AS $$
DECLARE
  parent_workspace uuid;
  parent_order uuid;
BEGIN
  IF TG_TABLE_NAME = 'restaurant_returns' THEN
    SELECT ro."workspaceId" INTO parent_workspace
    FROM "restaurant_orders" ro WHERE ro."id" = NEW."restaurantOrderId";
    IF parent_workspace IS DISTINCT FROM NEW."workspaceId" THEN
      RAISE EXCEPTION 'Cross-workspace restaurant return order reference rejected';
    END IF;
  ELSIF TG_TABLE_NAME = 'restaurant_return_items' THEN
    SELECT rr."workspaceId", rr."restaurantOrderId"
      INTO parent_workspace, parent_order
    FROM "restaurant_returns" rr WHERE rr."id" = NEW."restaurantReturnId";
    IF parent_workspace IS DISTINCT FROM NEW."workspaceId" THEN
      RAISE EXCEPTION 'Cross-workspace restaurant return item parent rejected';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "restaurant_order_items" roi
      WHERE roi."id" = NEW."restaurantOrderItemId"
        AND roi."restaurantOrderId" = parent_order
    ) THEN
      RAISE EXCEPTION 'Restaurant return item does not belong to the returned order';
    END IF;
  ELSIF TG_TABLE_NAME = 'restaurant_return_payment_allocations' THEN
    SELECT rr."workspaceId", rr."restaurantOrderId"
      INTO parent_workspace, parent_order
    FROM "restaurant_returns" rr WHERE rr."id" = NEW."restaurantReturnId";
    IF parent_workspace IS DISTINCT FROM NEW."workspaceId" THEN
      RAISE EXCEPTION 'Cross-workspace restaurant return payment allocation rejected';
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
    IF EXISTS (
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

DROP TRIGGER IF EXISTS "restaurant_returns_tenant_parent_guard" ON "restaurant_returns";
CREATE TRIGGER "restaurant_returns_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantOrderId"
ON "restaurant_returns"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_tenant_parents();

DROP TRIGGER IF EXISTS "restaurant_return_items_tenant_parent_guard" ON "restaurant_return_items";
CREATE TRIGGER "restaurant_return_items_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantReturnId", "restaurantOrderItemId"
ON "restaurant_return_items"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_tenant_parents();

DROP TRIGGER IF EXISTS "restaurant_return_payment_allocations_tenant_parent_guard" ON "restaurant_return_payment_allocations";
CREATE TRIGGER "restaurant_return_payment_allocations_tenant_parent_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantReturnId", "restaurantPaymentId"
ON "restaurant_return_payment_allocations"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_return_tenant_parents();

-- Prevent the full-payment refund path from double-refunding a payment that has
-- already funded an item-level return.
CREATE OR REPLACE FUNCTION reject_full_refund_after_item_return()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "restaurant_return_payment_allocations" a
    WHERE a."workspaceId" = NEW."workspaceId"
      AND a."restaurantPaymentId" = NEW."restaurantPaymentId"
  ) THEN
    RAISE EXCEPTION 'Restaurant payment already has item-return refund allocations';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_refunds_no_item_return_double_refund" ON "restaurant_refunds";
CREATE TRIGGER "restaurant_refunds_no_item_return_double_refund"
BEFORE INSERT ON "restaurant_refunds"
FOR EACH ROW EXECUTE FUNCTION reject_full_refund_after_item_return();

-- Recalculate status against net order value after item returns and net retained
-- payments after partial refund allocations. Deferred execution makes this the
-- final status even when an older service writes paymentStatus earlier in the tx.
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

DROP TRIGGER IF EXISTS "restaurant_returns_sync_payment_status" ON "restaurant_returns";
CREATE CONSTRAINT TRIGGER "restaurant_returns_sync_payment_status"
AFTER INSERT OR UPDATE ON "restaurant_returns"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sync_restaurant_net_payment_status();

DROP TRIGGER IF EXISTS "restaurant_return_allocations_sync_payment_status" ON "restaurant_return_payment_allocations";
CREATE CONSTRAINT TRIGGER "restaurant_return_allocations_sync_payment_status"
AFTER INSERT OR UPDATE ON "restaurant_return_payment_allocations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sync_restaurant_net_payment_status();

DROP TRIGGER IF EXISTS "restaurant_refunds_sync_net_payment_status" ON "restaurant_refunds";
CREATE CONSTRAINT TRIGGER "restaurant_refunds_sync_net_payment_status"
AFTER INSERT OR UPDATE ON "restaurant_refunds"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sync_restaurant_net_payment_status();

DROP TRIGGER IF EXISTS "restaurant_payments_sync_net_payment_status" ON "restaurant_payments";
CREATE CONSTRAINT TRIGGER "restaurant_payments_sync_net_payment_status"
AFTER INSERT OR UPDATE OF "amount", "postedAt", "voidedAt" ON "restaurant_payments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sync_restaurant_net_payment_status();
