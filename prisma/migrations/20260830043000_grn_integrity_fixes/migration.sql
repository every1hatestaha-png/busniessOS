ALTER TABLE "goods_received_notes" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "goods_received_notes_workspaceId_idempotencyKey_key" ON "goods_received_notes"("workspaceId", "idempotencyKey");
