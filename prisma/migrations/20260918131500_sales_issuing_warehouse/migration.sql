-- Store the immutable issuing warehouse on sales documents for managed stock.
ALTER TABLE "sales_orders"
  ADD COLUMN IF NOT EXISTS "warehouseId" uuid;

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_warehouse_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "sales_orders_workspace_warehouse_idx"
  ON "sales_orders" ("workspaceId", "warehouseId");
