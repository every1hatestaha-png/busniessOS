ALTER TYPE "DocumentKind" ADD VALUE 'PURCHASE_ORDER';
ALTER TYPE "LedgerEntryType" ADD VALUE 'REVERSAL';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'SALE_CANCELLATION';
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

ALTER TABLE "sales_orders" ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "cancelledById" TEXT;
ALTER TABLE "sales_order_items" ADD COLUMN "productName" TEXT, ADD COLUMN "productSku" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0, ADD COLUMN "balanceAmount" DECIMAL(15,2) NOT NULL DEFAULT 0, ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN "productName" TEXT, ADD COLUMN "productSku" TEXT;
ALTER TABLE "payments" ADD COLUMN "isReversed" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "reversedAt" TIMESTAMP(3), ADD COLUMN "reversalOfId" TEXT;

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "actorId" TEXT, "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "workspace_invitations" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "email" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'STAFF',
  "token" TEXT NOT NULL, "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING', "invitedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_orders_workspaceId_idempotencyKey_key" ON "purchase_orders"("workspaceId", "idempotencyKey");
CREATE INDEX "purchase_orders_workspaceId_status_idx" ON "purchase_orders"("workspaceId", "status");
CREATE INDEX "payments_reversalOfId_idx" ON "payments"("reversalOfId");
CREATE INDEX "audit_logs_workspaceId_createdAt_idx" ON "audit_logs"("workspaceId", "createdAt");
CREATE INDEX "audit_logs_workspaceId_entityType_entityId_idx" ON "audit_logs"("workspaceId", "entityType", "entityId");
CREATE UNIQUE INDEX "workspace_invitations_token_key" ON "workspace_invitations"("token");
CREATE INDEX "workspace_invitations_workspaceId_status_idx" ON "workspace_invitations"("workspaceId", "status");
CREATE INDEX "workspace_invitations_email_status_idx" ON "workspace_invitations"("email", "status");

ALTER TABLE "payments" ADD CONSTRAINT "payments_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "sales_order_items" i SET "productName" = p."name", "productSku" = p."sku" FROM "products" p WHERE p."id" = i."productId";
UPDATE "purchase_order_items" i SET "productName" = p."name", "productSku" = p."sku" FROM "products" p WHERE p."id" = i."productId";
UPDATE "purchase_orders" SET "balanceAmount" = "totalAmount" - "paidAmount";
