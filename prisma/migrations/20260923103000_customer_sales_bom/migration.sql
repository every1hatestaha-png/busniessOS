-- Customer-specific sales BOMs and immutable sale-time component snapshots.
-- Core entity IDs remain UUID strings in TEXT columns, so additive module tables use UUID
-- identifiers and validate ownership in the domain layer, matching existing industry modules.

CREATE TABLE IF NOT EXISTS "customer_sales_boms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "customerId" uuid NOT NULL,
  "productId" uuid NOT NULL,
  "productCode" text NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "customer_sales_boms_workspace_customer_product_unique" UNIQUE ("workspaceId", "customerId", "productId")
);
CREATE INDEX IF NOT EXISTS "customer_sales_boms_workspace_customer_active_idx"
  ON "customer_sales_boms"("workspaceId", "customerId", "isActive");
CREATE INDEX IF NOT EXISTS "customer_sales_boms_workspace_product_idx"
  ON "customer_sales_boms"("workspaceId", "productId");

CREATE TABLE IF NOT EXISTS "customer_sales_bom_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "customerSalesBomId" uuid NOT NULL REFERENCES "customer_sales_boms"("id") ON DELETE CASCADE,
  "componentProductId" uuid NOT NULL,
  "quantityPerUnit" numeric(15,4) NOT NULL CHECK ("quantityPerUnit" > 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "customer_sales_bom_items_bom_component_unique" UNIQUE ("customerSalesBomId", "componentProductId")
);

CREATE TABLE IF NOT EXISTS "sales_order_component_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "salesOrderId" uuid NOT NULL,
  "parentProductId" uuid NOT NULL,
  "componentProductId" uuid NOT NULL,
  "productCode" text NOT NULL,
  "componentName" text NOT NULL,
  "componentSku" text,
  "quantityPerUnit" numeric(15,4) NOT NULL CHECK ("quantityPerUnit" > 0),
  "soldQuantity" numeric(15,4) NOT NULL CHECK ("soldQuantity" > 0),
  "totalQuantityConsumed" numeric(15,4) NOT NULL CHECK ("totalQuantityConsumed" > 0),
  "unitCost" numeric(15,2) NOT NULL CHECK ("unitCost" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sales_order_component_snapshots_order_parent_component_unique"
    UNIQUE ("salesOrderId", "parentProductId", "componentProductId")
);
CREATE INDEX IF NOT EXISTS "sales_order_component_snapshots_workspace_order_idx"
  ON "sales_order_component_snapshots"("workspaceId", "salesOrderId");
CREATE INDEX IF NOT EXISTS "sales_order_component_snapshots_workspace_component_idx"
  ON "sales_order_component_snapshots"("workspaceId", "componentProductId", "createdAt");
