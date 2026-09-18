-- Add immutable receiving warehouse reference to GRNs for managed location inventory.
ALTER TABLE "goods_received_notes"
  ADD COLUMN IF NOT EXISTS "warehouseId" uuid;

ALTER TABLE "goods_received_notes"
  ADD CONSTRAINT "goods_received_notes_warehouse_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "goods_received_notes_workspace_warehouse_idx"
  ON "goods_received_notes" ("workspaceId", "warehouseId");
