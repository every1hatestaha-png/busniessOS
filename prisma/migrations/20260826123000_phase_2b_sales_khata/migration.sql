ALTER TYPE "PaymentMethod" ADD VALUE 'JAZZCASH';
ALTER TYPE "PaymentMethod" ADD VALUE 'EASYPAISA';
ALTER TYPE "PaymentMethod" ADD VALUE 'OTHER';

CREATE TYPE "DocumentKind" AS ENUM ('SALES_ORDER', 'INVOICE', 'PAYMENT_RECEIPT');

ALTER TABLE "sales_orders" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "payments" ADD COLUMN "invoiceId" TEXT;

CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_sequences_workspaceId_kind_key" ON "document_sequences"("workspaceId", "kind");
CREATE UNIQUE INDEX "sales_orders_workspaceId_idempotencyKey_key" ON "sales_orders"("workspaceId", "idempotencyKey");
CREATE INDEX "sales_orders_workspaceId_status_idx" ON "sales_orders"("workspaceId", "status");
CREATE UNIQUE INDEX "invoices_salesOrderId_key" ON "invoices"("salesOrderId");
CREATE INDEX "invoices_workspaceId_status_idx" ON "invoices"("workspaceId", "status");
CREATE INDEX "invoices_workspaceId_issuedAt_idx" ON "invoices"("workspaceId", "issuedAt");
CREATE INDEX "payments_workspaceId_invoiceId_idx" ON "payments"("workspaceId", "invoiceId");

ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
