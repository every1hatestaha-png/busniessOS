-- Restaurant Workspace V1.3 item returns
-- Snapshot exact per-order-line consumption when inventory is first posted so later
-- returns never depend on a recipe that may have changed after the sale.

ALTER TABLE "restaurant_orders"
  ADD COLUMN IF NOT EXISTS "returnedAmount" numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "returnedTaxAmount" numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "returnedInventoryCost" numeric(15,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "restaurant_order_item_consumptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "restaurantOrderId" uuid NOT NULL REFERENCES "restaurant_orders"("id") ON DELETE RESTRICT,
  "restaurantOrderItemId" uuid NOT NULL REFERENCES "restaurant_order_items"("id") ON DELETE RESTRICT,
  "productId" text NOT NULL,
  "warehouseId" uuid,
  "quantity" numeric(15,4) NOT NULL CHECK ("quantity" > 0),
  "unitCost" numeric(15,2) NOT NULL CHECK ("unitCost" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_item_consumption_unique"
  ON "restaurant_order_item_consumptions"("restaurantOrderItemId", "productId");
CREATE INDEX IF NOT EXISTS "restaurant_item_consumption_order_idx"
  ON "restaurant_order_item_consumptions"("workspaceId", "restaurantOrderId");

CREATE TABLE IF NOT EXISTS "restaurant_item_returns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "restaurantOrderId" uuid NOT NULL REFERENCES "restaurant_orders"("id") ON DELETE RESTRICT,
  "cashBankAccountId" text,
  "subtotalAmount" numeric(15,2) NOT NULL CHECK ("subtotalAmount" >= 0),
  "taxAmount" numeric(15,2) NOT NULL CHECK ("taxAmount" >= 0),
  "refundAmount" numeric(15,2) NOT NULL CHECK ("refundAmount" >= 0),
  "inventoryCost" numeric(15,2) NOT NULL CHECK ("inventoryCost" >= 0),
  "reason" text NOT NULL CHECK (char_length("reason") BETWEEN 3 AND 500),
  "idempotencyKey" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_item_returns_idempotency_unique"
  ON "restaurant_item_returns"("workspaceId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "restaurant_item_returns_order_idx"
  ON "restaurant_item_returns"("workspaceId", "restaurantOrderId", "createdAt");

CREATE TABLE IF NOT EXISTS "restaurant_item_return_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurantItemReturnId" uuid NOT NULL REFERENCES "restaurant_item_returns"("id") ON DELETE RESTRICT,
  "restaurantOrderItemId" uuid NOT NULL REFERENCES "restaurant_order_items"("id") ON DELETE RESTRICT,
  "quantity" numeric(15,4) NOT NULL CHECK ("quantity" > 0),
  "subtotalAmount" numeric(15,2) NOT NULL CHECK ("subtotalAmount" >= 0),
  "taxAmount" numeric(15,2) NOT NULL CHECK ("taxAmount" >= 0),
  "inventoryCost" numeric(15,2) NOT NULL CHECK ("inventoryCost" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_item_return_line_unique"
  ON "restaurant_item_return_lines"("restaurantItemReturnId", "restaurantOrderItemId");
CREATE INDEX IF NOT EXISTS "restaurant_item_return_lines_order_item_idx"
  ON "restaurant_item_return_lines"("restaurantOrderItemId");

CREATE OR REPLACE FUNCTION snapshot_restaurant_order_item_consumption()
RETURNS trigger AS $$
DECLARE
  line record;
  recipe_row record;
  ingredient record;
  factor numeric;
  warehouse_id uuid;
  warehouse_count int;
BEGIN
  IF OLD."inventoryPostedAt" IS NOT NULL OR NEW."inventoryPostedAt" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int
    INTO warehouse_count
  FROM "warehouses" w
  WHERE w."workspaceId" = NEW."workspaceId"
    AND w."isActive" = true
    AND w."isDefault" = true;

  IF warehouse_count = 1 THEN
    SELECT w."id"
      INTO warehouse_id
    FROM "warehouses" w
    WHERE w."workspaceId" = NEW."workspaceId"
      AND w."isActive" = true
      AND w."isDefault" = true
    LIMIT 1;
  ELSE
    warehouse_id := NULL;
  END IF;

  FOR line IN
    SELECT roi."id" AS order_item_id, roi."quantity", mi."productId"
    FROM "restaurant_order_items" roi
    JOIN "restaurant_menu_items" mi ON mi."id" = roi."menuItemId"
    WHERE roi."restaurantOrderId" = NEW."id"
      AND mi."workspaceId" = NEW."workspaceId"
      AND mi."productId" IS NOT NULL
  LOOP
    SELECT r."id", r."yieldQuantity"
      INTO recipe_row
    FROM "recipes" r
    WHERE r."workspaceId" = NEW."workspaceId"
      AND r."finishedProductId"::text = line."productId"
      AND r."isActive" = true
    LIMIT 1;

    IF recipe_row."id" IS NULL THEN
      INSERT INTO "restaurant_order_item_consumptions" (
        "workspaceId", "restaurantOrderId", "restaurantOrderItemId", "productId", "warehouseId", "quantity", "unitCost"
      )
      SELECT NEW."workspaceId", NEW."id", line.order_item_id, p."id", warehouse_id, line."quantity", p."costPrice"
      FROM "products" p
      WHERE p."id" = line."productId" AND p."workspaceId" = NEW."workspaceId"::text
      ON CONFLICT ("restaurantOrderItemId", "productId") DO NOTHING;
    ELSE
      factor := line."quantity" / recipe_row."yieldQuantity";
      FOR ingredient IN
        SELECT ri."ingredientProductId", ri."quantity", ri."wastagePercent"
        FROM "recipe_items" ri
        WHERE ri."recipeId" = recipe_row."id"
      LOOP
        INSERT INTO "restaurant_order_item_consumptions" (
          "workspaceId", "restaurantOrderId", "restaurantOrderItemId", "productId", "warehouseId", "quantity", "unitCost"
        )
        SELECT NEW."workspaceId", NEW."id", line.order_item_id, p."id", warehouse_id,
               ingredient."quantity" * factor * (1 + ingredient."wastagePercent" / 100), p."costPrice"
        FROM "products" p
        WHERE p."id" = ingredient."ingredientProductId"::text AND p."workspaceId" = NEW."workspaceId"::text
        ON CONFLICT ("restaurantOrderItemId", "productId") DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_order_item_consumption_snapshot" ON "restaurant_orders";
CREATE TRIGGER "restaurant_order_item_consumption_snapshot"
AFTER UPDATE OF "inventoryPostedAt" ON "restaurant_orders"
FOR EACH ROW EXECUTE FUNCTION snapshot_restaurant_order_item_consumption();

CREATE OR REPLACE FUNCTION enforce_restaurant_item_return_tenant_parent()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "restaurant_orders" ro
    WHERE ro."id" = NEW."restaurantOrderId" AND ro."workspaceId" = NEW."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace restaurant item return order reference rejected';
  END IF;
  IF NEW."cashBankAccountId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "cash_bank_accounts" cba
    WHERE cba."id" = NEW."cashBankAccountId" AND cba."workspaceId"::uuid = NEW."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace restaurant item return cash account reference rejected';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "restaurant_item_returns_tenant_guard" ON "restaurant_item_returns";
CREATE TRIGGER "restaurant_item_returns_tenant_guard"
BEFORE INSERT OR UPDATE OF "workspaceId", "restaurantOrderId", "cashBankAccountId"
ON "restaurant_item_returns"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_item_return_tenant_parent();
