-- Phase 2D: additive only. New enum values, purchase cancellation columns,
-- payment allocations, credit/debit notes, and customer/supplier returns.

-- Enum additions
ALTER TYPE "DocumentKind" ADD VALUE 'CREDIT_NOTE';
ALTER TYPE "DocumentKind" ADD VALUE 'DEBIT_NOTE';
ALTER TYPE "DocumentKind" ADD VALUE 'CUSTOMER_RETURN';
ALTER TYPE "DocumentKind" ADD VALUE 'SUPPLIER_RETURN';
ALTER TYPE "LedgerEntryType" ADD VALUE 'CREDIT_NOTE';
ALTER TYPE "LedgerEntryType" ADD VALUE 'DEBIT_NOTE';
ALTER TYPE "LedgerEntryType" ADD VALUE 'SALES_RETURN';
ALTER TYPE "LedgerEntryType" ADD VALUE 'PURCHASE_RETURN';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'PURCHASE_CANCELLATION';

-- Purchase cancellation columns (mirrors sales_orders)
ALTER TABLE "purchase_orders" ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "cancelledById" TEXT;

-- Payment allocations: one payment applied across many invoices / purchases
CREATE TABLE "payment_allocations" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "purchaseOrderId" TEXT,
  "amount" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_notes" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "salesOrderId" TEXT,
  "number" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "debit_notes" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "purchaseOrderId" TEXT,
  "number" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_returns" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "salesOrderId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "reason" TEXT,
  "totalAmount" DECIMAL(15,2) NOT NULL,
  "restock" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_return_items" (
  "id" TEXT NOT NULL,
  "customerReturnId" TEXT NOT NULL,
  "salesOrderItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(15,2) NOT NULL,
  "totalPrice" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_return_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_returns" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "reason" TEXT,
  "totalAmount" DECIMAL(15,2) NOT NULL,
  "notes" TEXT,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_return_items" (
  "id" TEXT NOT NULL,
  "supplierReturnId" TEXT NOT NULL,
  "purchaseOrderItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(15,2) NOT NULL,
  "totalCost" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_return_items_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "payment_allocations_workspaceId_idx" ON "payment_allocations"("workspaceId");
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");
CREATE INDEX "payment_allocations_purchaseOrderId_idx" ON "payment_allocations"("purchaseOrderId");

CREATE UNIQUE INDEX "credit_notes_workspaceId_number_key" ON "credit_notes"("workspaceId", "number");
CREATE INDEX "credit_notes_workspaceId_customerId_idx" ON "credit_notes"("workspaceId", "customerId");

CREATE UNIQUE INDEX "debit_notes_workspaceId_number_key" ON "debit_notes"("workspaceId", "number");
CREATE INDEX "debit_notes_workspaceId_supplierId_idx" ON "debit_notes"("workspaceId", "supplierId");

CREATE UNIQUE INDEX "customer_returns_workspaceId_number_key" ON "customer_returns"("workspaceId", "number");
CREATE INDEX "customer_returns_workspaceId_customerId_idx" ON "customer_returns"("workspaceId", "customerId");
CREATE INDEX "customer_returns_workspaceId_salesOrderId_idx" ON "customer_returns"("workspaceId", "salesOrderId");

CREATE INDEX "customer_return_items_customerReturnId_idx" ON "customer_return_items"("customerReturnId");
CREATE INDEX "customer_return_items_salesOrderItemId_idx" ON "customer_return_items"("salesOrderItemId");

CREATE UNIQUE INDEX "supplier_returns_workspaceId_number_key" ON "supplier_returns"("workspaceId", "number");
CREATE INDEX "supplier_returns_workspaceId_supplierId_idx" ON "supplier_returns"("workspaceId", "supplierId");
CREATE INDEX "supplier_returns_workspaceId_purchaseOrderId_idx" ON "supplier_returns"("workspaceId", "purchaseOrderId");

CREATE INDEX "supplier_return_items_supplierReturnId_idx" ON "supplier_return_items"("supplierReturnId");
CREATE INDEX "supplier_return_items_purchaseOrderItemId_idx" ON "supplier_return_items"("purchaseOrderItemId");

-- Foreign keys
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_returns" ADD CONSTRAINT "customer_returns_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_returns" ADD CONSTRAINT "customer_returns_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_returns" ADD CONSTRAINT "customer_returns_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_return_items" ADD CONSTRAINT "customer_return_items_customerReturnId_fkey" FOREIGN KEY ("customerReturnId") REFERENCES "customer_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "supplier_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
