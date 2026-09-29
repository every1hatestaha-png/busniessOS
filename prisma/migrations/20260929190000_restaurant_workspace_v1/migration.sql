-- Restaurant Workspace V1
-- Additive, tenant-scoped restaurant ordering and menu foundation.
-- WhatsApp intake is deliberately staged as PENDING_REVIEW; it never posts
-- inventory or accounting side effects before an authenticated staff review.

CREATE TABLE IF NOT EXISTS "restaurant_menu_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "name" text NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "restaurant_menu_categories_workspace_name_unique" UNIQUE ("workspaceId", "name")
);
CREATE INDEX IF NOT EXISTS "restaurant_menu_categories_workspace_active_idx"
  ON "restaurant_menu_categories"("workspaceId", "isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "restaurant_menu_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "categoryId" uuid NOT NULL REFERENCES "restaurant_menu_categories"("id") ON DELETE RESTRICT,
  "productId" text,
  "name" text NOT NULL,
  "description" text,
  "price" numeric(15,2) NOT NULL CHECK ("price" >= 0),
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "isAvailable" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "restaurant_menu_items_category_name_unique" UNIQUE ("categoryId", "name")
);
CREATE INDEX IF NOT EXISTS "restaurant_menu_items_workspace_category_idx"
  ON "restaurant_menu_items"("workspaceId", "categoryId", "isActive", "isAvailable", "sortOrder");
CREATE INDEX IF NOT EXISTS "restaurant_menu_items_workspace_product_idx"
  ON "restaurant_menu_items"("workspaceId", "productId") WHERE "productId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "restaurant_order_sequences" (
  "workspaceId" uuid PRIMARY KEY,
  "nextNumber" bigint NOT NULL DEFAULT 1 CHECK ("nextNumber" > 0)
);

CREATE TABLE IF NOT EXISTS "restaurant_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "orderNumber" text NOT NULL,
  "source" text NOT NULL CHECK ("source" IN ('POS','WHATSAPP','MANUAL')),
  "fulfillmentType" text NOT NULL CHECK ("fulfillmentType" IN ('DINE_IN','TAKEAWAY','DELIVERY')),
  "status" text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK ("status" IN ('PENDING_REVIEW','CONFIRMED','PREPARING','READY','COMPLETED','CANCELLED')),
  "paymentStatus" text NOT NULL DEFAULT 'UNPAID' CHECK ("paymentStatus" IN ('UNPAID','PARTIALLY_PAID','PAID')),
  "restaurantTableId" uuid REFERENCES "restaurant_tables"("id") ON DELETE SET NULL,
  "customerName" text,
  "customerPhone" text,
  "deliveryAddress" text,
  "notes" text,
  "subtotal" numeric(15,2) NOT NULL DEFAULT 0 CHECK ("subtotal" >= 0),
  "discountAmount" numeric(15,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "taxAmount" numeric(15,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "total" numeric(15,2) NOT NULL DEFAULT 0 CHECK ("total" >= 0),
  "externalReference" text,
  "createdById" text,
  "confirmedById" text,
  "confirmedAt" timestamptz,
  "completedAt" timestamptz,
  "cancelledAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "restaurant_orders_workspace_number_unique" UNIQUE ("workspaceId", "orderNumber")
);
CREATE INDEX IF NOT EXISTS "restaurant_orders_workspace_status_idx"
  ON "restaurant_orders"("workspaceId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "restaurant_orders_workspace_source_idx"
  ON "restaurant_orders"("workspaceId", "source", "createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_orders_external_reference_unique"
  ON "restaurant_orders"("workspaceId", "source", "externalReference") WHERE "externalReference" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "restaurant_order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurantOrderId" uuid NOT NULL REFERENCES "restaurant_orders"("id") ON DELETE CASCADE,
  "menuItemId" uuid REFERENCES "restaurant_menu_items"("id") ON DELETE SET NULL,
  "itemName" text NOT NULL,
  "quantity" numeric(15,4) NOT NULL CHECK ("quantity" > 0),
  "unitPrice" numeric(15,2) NOT NULL CHECK ("unitPrice" >= 0),
  "lineTotal" numeric(15,2) NOT NULL CHECK ("lineTotal" >= 0),
  "notes" text,
  "modifiers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "restaurant_order_items_order_idx"
  ON "restaurant_order_items"("restaurantOrderId");

CREATE TABLE IF NOT EXISTS "restaurant_whatsapp_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "externalMessageId" text NOT NULL,
  "customerPhone" text NOT NULL,
  "customerName" text,
  "body" text NOT NULL,
  "restaurantOrderId" uuid REFERENCES "restaurant_orders"("id") ON DELETE SET NULL,
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "restaurant_whatsapp_messages_workspace_external_unique" UNIQUE ("workspaceId", "externalMessageId")
);
CREATE INDEX IF NOT EXISTS "restaurant_whatsapp_messages_workspace_received_idx"
  ON "restaurant_whatsapp_messages"("workspaceId", "receivedAt" DESC);

ALTER TABLE "kitchen_tickets"
  ADD COLUMN IF NOT EXISTS "restaurantOrderId" uuid REFERENCES "restaurant_orders"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "kitchen_tickets_restaurant_order_idx"
  ON "kitchen_tickets"("workspaceId", "restaurantOrderId") WHERE "restaurantOrderId" IS NOT NULL;
