-- Additive shared recovery budget; no email or provider identity is stored.
CREATE TABLE "auth_recovery_buckets" (
  "emailHash" TEXT NOT NULL PRIMARY KEY,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL,
  CONSTRAINT "auth_recovery_buckets_attempts_check" CHECK ("attempts" BETWEEN 1 AND 3),
  CONSTRAINT "auth_recovery_buckets_hash_check" CHECK ("emailHash" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "auth_recovery_buckets_windowStartedAt_idx" ON "auth_recovery_buckets" ("windowStartedAt");
CREATE INDEX "sales_orders_workspaceId_orderDate_id_idx" ON "sales_orders" ("workspaceId", "orderDate", "id");
