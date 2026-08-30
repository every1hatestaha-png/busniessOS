CREATE INDEX "general_ledger_entries_workspaceId_accountId_date_createdAt_id_idx"
ON "general_ledger_entries"("workspaceId", "accountId", "date", "createdAt", "id");

CREATE INDEX "inventory_transactions_workspaceId_type_createdAt_idx"
ON "inventory_transactions"("workspaceId", "type", "createdAt");

CREATE INDEX "sales_orders_workspaceId_orderDate_status_idx"
ON "sales_orders"("workspaceId", "orderDate", "status");

CREATE INDEX "purchase_orders_workspaceId_supplierId_status_orderDate_idx"
ON "purchase_orders"("workspaceId", "supplierId", "status", "orderDate");

CREATE INDEX "invoices_workspaceId_customerId_status_dueDate_idx"
ON "invoices"("workspaceId", "customerId", "status", "dueDate");

CREATE INDEX "payments_workspaceId_customerId_paymentDate_idx"
ON "payments"("workspaceId", "customerId", "paymentDate");

CREATE INDEX "payments_workspaceId_supplierId_paymentDate_idx"
ON "payments"("workspaceId", "supplierId", "paymentDate");

CREATE INDEX "ledger_entries_workspaceId_customerId_date_createdAt_idx"
ON "ledger_entries"("workspaceId", "customerId", "date", "createdAt");

CREATE INDEX "ledger_entries_workspaceId_supplierId_date_createdAt_idx"
ON "ledger_entries"("workspaceId", "supplierId", "date", "createdAt");
