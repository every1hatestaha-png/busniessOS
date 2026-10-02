-- Restaurant V1.88 operational query indexes.
--
-- Synthetic PostgreSQL 16 evidence at 20k orders / 10k payments showed the
-- operational order board performing full workspace scans plus sorts for the
-- latest-order and latest-payment projections. These indexes match the actual
-- workspace + recency access pattern without changing financial semantics.

CREATE INDEX IF NOT EXISTS "restaurant_orders_workspace_created_idx"
  ON "restaurant_orders" ("workspaceId", "createdAt" DESC, "id");

CREATE INDEX IF NOT EXISTS "restaurant_payments_workspace_created_idx"
  ON "restaurant_payments" ("workspaceId", "createdAt" DESC, "id");
