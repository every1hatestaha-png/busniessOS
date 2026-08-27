-- Phase 2D follow-up: persistent idempotency for payment and return mutations.

ALTER TABLE "payments" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "customer_returns" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "supplier_returns" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "payments_workspaceId_idempotencyKey_key" ON "payments"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "customer_returns_workspaceId_idempotencyKey_key" ON "customer_returns"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "supplier_returns_workspaceId_idempotencyKey_key" ON "supplier_returns"("workspaceId", "idempotencyKey");
