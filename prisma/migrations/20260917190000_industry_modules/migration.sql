-- MunshiOS industry modules (additive, tenant-scoped)
-- This migration intentionally does not alter existing finance-grade tables.

CREATE TABLE IF NOT EXISTS "workspace_modules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "moduleKey" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_modules_workspace_module_unique" UNIQUE ("workspaceId", "moduleKey")
);
CREATE INDEX IF NOT EXISTS "workspace_modules_workspace_enabled_idx" ON "workspace_modules"("workspaceId", "enabled");

CREATE TABLE IF NOT EXISTS "restaurant_tables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "capacity" integer NOT NULL DEFAULT 2 CHECK ("capacity" > 0),
  "area" text,
  "status" text NOT NULL DEFAULT 'AVAILABLE' CHECK ("status" IN ('AVAILABLE','OCCUPIED','RESERVED','INACTIVE')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "restaurant_tables_workspace_name_unique" UNIQUE ("workspaceId", "name")
);
CREATE INDEX IF NOT EXISTS "restaurant_tables_workspace_status_idx" ON "restaurant_tables"("workspaceId", "status");

CREATE TABLE IF NOT EXISTS "recipes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "finishedProductId" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "yieldQuantity" numeric(15,4) NOT NULL DEFAULT 1 CHECK ("yieldQuantity" > 0),
  "notes" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recipes_workspace_finished_unique" UNIQUE ("workspaceId", "finishedProductId")
);

CREATE TABLE IF NOT EXISTS "recipe_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipeId" uuid NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE,
  "ingredientProductId" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "quantity" numeric(15,4) NOT NULL CHECK ("quantity" > 0),
  "wastagePercent" numeric(7,4) NOT NULL DEFAULT 0 CHECK ("wastagePercent" >= 0 AND "wastagePercent" <= 100),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recipe_items_recipe_ingredient_unique" UNIQUE ("recipeId", "ingredientProductId")
);

CREATE TABLE IF NOT EXISTS "kitchen_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "salesOrderId" uuid REFERENCES "sales_orders"("id") ON DELETE SET NULL,
  "restaurantTableId" uuid REFERENCES "restaurant_tables"("id") ON DELETE SET NULL,
  "ticketNumber" text NOT NULL,
  "status" text NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED','PREPARING','READY','SERVED','CANCELLED')),
  "notes" text,
  "startedAt" timestamptz,
  "readyAt" timestamptz,
  "servedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "kitchen_tickets_workspace_number_unique" UNIQUE ("workspaceId", "ticketNumber")
);
CREATE INDEX IF NOT EXISTS "kitchen_tickets_workspace_status_idx" ON "kitchen_tickets"("workspaceId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "cash_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "openedById" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "closedById" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "openedAt" timestamptz NOT NULL DEFAULT now(),
  "closedAt" timestamptz,
  "openingCash" numeric(15,2) NOT NULL DEFAULT 0,
  "expectedCash" numeric(15,2),
  "closingCash" numeric(15,2),
  "variance" numeric(15,2),
  "notes" text,
  "status" text NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','CLOSED'))
);
CREATE INDEX IF NOT EXISTS "cash_shifts_workspace_status_idx" ON "cash_shifts"("workspaceId", "status", "openedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "cash_shifts_one_open_per_workspace" ON "cash_shifts"("workspaceId") WHERE "status"='OPEN';

CREATE TABLE IF NOT EXISTS "warehouses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "address" text,
  "isDefault" boolean NOT NULL DEFAULT false,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "warehouses_workspace_code_unique" UNIQUE ("workspaceId", "code")
);
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_one_default_per_workspace" ON "warehouses"("workspaceId") WHERE "isDefault"=true AND "isActive"=true;

CREATE TABLE IF NOT EXISTS "warehouse_stocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "warehouseId" uuid NOT NULL REFERENCES "warehouses"("id") ON DELETE CASCADE,
  "productId" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "quantity" numeric(15,4) NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "warehouse_stocks_warehouse_product_unique" UNIQUE ("warehouseId", "productId")
);
CREATE INDEX IF NOT EXISTS "warehouse_stocks_workspace_product_idx" ON "warehouse_stocks"("workspaceId", "productId");

CREATE TABLE IF NOT EXISTS "boms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "finishedProductId" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "outputQuantity" numeric(15,4) NOT NULL DEFAULT 1 CHECK ("outputQuantity" > 0),
  "isActive" boolean NOT NULL DEFAULT true,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "boms_workspace_product_version_unique" UNIQUE ("workspaceId", "finishedProductId", "version")
);

CREATE TABLE IF NOT EXISTS "bom_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bomId" uuid NOT NULL REFERENCES "boms"("id") ON DELETE CASCADE,
  "materialProductId" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "quantity" numeric(15,4) NOT NULL CHECK ("quantity" > 0),
  "wastagePercent" numeric(7,4) NOT NULL DEFAULT 0 CHECK ("wastagePercent" >= 0 AND "wastagePercent" <= 100),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "bom_items_bom_material_unique" UNIQUE ("bomId", "materialProductId")
);

CREATE TABLE IF NOT EXISTS "production_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "bomId" uuid NOT NULL REFERENCES "boms"("id") ON DELETE RESTRICT,
  "runNumber" text NOT NULL,
  "plannedOutput" numeric(15,4) NOT NULL CHECK ("plannedOutput" > 0),
  "actualOutput" numeric(15,4),
  "wastageQuantity" numeric(15,4) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','APPROVED','POSTED','CANCELLED')),
  "approvedById" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approvedAt" timestamptz,
  "postedById" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "postedAt" timestamptz,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "production_runs_workspace_number_unique" UNIQUE ("workspaceId", "runNumber")
);
CREATE INDEX IF NOT EXISTS "production_runs_workspace_status_idx" ON "production_runs"("workspaceId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "production_consumptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "productionRunId" uuid NOT NULL REFERENCES "production_runs"("id") ON DELETE CASCADE,
  "productId" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "plannedQuantity" numeric(15,4) NOT NULL,
  "actualQuantity" numeric(15,4) NOT NULL,
  "unitCost" numeric(15,2) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "production_consumptions_run_product_unique" UNIQUE ("productionRunId", "productId")
);

CREATE TABLE IF NOT EXISTS "service_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "customerId" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "quoteNumber" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CONVERTED')),
  "subtotal" numeric(15,2) NOT NULL DEFAULT 0,
  "discount" numeric(15,2) NOT NULL DEFAULT 0,
  "tax" numeric(15,2) NOT NULL DEFAULT 0,
  "total" numeric(15,2) NOT NULL DEFAULT 0,
  "validUntil" timestamptz,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "service_quotes_workspace_number_unique" UNIQUE ("workspaceId", "quoteNumber")
);

CREATE TABLE IF NOT EXISTS "service_quote_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "serviceQuoteId" uuid NOT NULL REFERENCES "service_quotes"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "quantity" numeric(15,4) NOT NULL DEFAULT 1 CHECK ("quantity" > 0),
  "unitPrice" numeric(15,2) NOT NULL CHECK ("unitPrice" >= 0),
  "lineTotal" numeric(15,2) NOT NULL CHECK ("lineTotal" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "service_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "customerId" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "serviceQuoteId" uuid REFERENCES "service_quotes"("id") ON DELETE SET NULL,
  "jobNumber" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','COMPLETED','CANCELLED')),
  "assignedToId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "scheduledAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "service_jobs_workspace_number_unique" UNIQUE ("workspaceId", "jobNumber")
);
CREATE INDEX IF NOT EXISTS "service_jobs_workspace_status_idx" ON "service_jobs"("workspaceId", "status", "createdAt");
