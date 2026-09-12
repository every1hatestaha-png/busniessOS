-- Add persisted sales-tax details without changing legacy sales-order semantics.
CREATE TABLE "sales_tax_details" (
  "salesOrderId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "taxRate" DECIMAL(7,4) NOT NULL,
  "taxMode" TEXT NOT NULL,
  "taxableAmount" DECIMAL(15,2) NOT NULL,
  "taxAmount" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_tax_details_pkey" PRIMARY KEY ("salesOrderId"),
  CONSTRAINT "sales_tax_details_taxMode_check" CHECK ("taxMode" IN ('EXCLUSIVE', 'INCLUSIVE')),
  CONSTRAINT "sales_tax_details_taxRate_check" CHECK ("taxRate" > 0 AND "taxRate" <= 100),
  CONSTRAINT "sales_tax_details_taxAmount_check" CHECK ("taxAmount" >= 0),
  CONSTRAINT "sales_tax_details_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_tax_details_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "sales_tax_details_workspaceId_idx" ON "sales_tax_details"("workspaceId");
CREATE INDEX "sales_tax_details_workspaceId_createdAt_idx" ON "sales_tax_details"("workspaceId", "createdAt");
