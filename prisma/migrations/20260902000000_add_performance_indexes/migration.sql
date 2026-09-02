-- CreateIndex
CREATE INDEX "customers_workspaceId_updatedAt_idx" ON "customers"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "products_workspaceId_status_idx" ON "products"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "sales_orders_workspaceId_updatedAt_idx" ON "sales_orders"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "invoices_workspaceId_updatedAt_idx" ON "invoices"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "goods_received_notes_workspaceId_receiptDate_idx" ON "goods_received_notes"("workspaceId", "receiptDate");

-- CreateIndex
CREATE INDEX "customer_credit_allocations_workspaceId_createdAt_idx" ON "customer_credit_allocations"("workspaceId", "createdAt");
