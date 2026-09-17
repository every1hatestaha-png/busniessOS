-- Invoice document metadata is kept separate from the accounting invoice row so
-- delivery-challan presentation data can evolve without changing ledger logic.
CREATE TABLE "invoice_document_metadata" (
    "invoiceId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dcNumber" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_document_metadata_pkey" PRIMARY KEY ("invoiceId")
);

CREATE UNIQUE INDEX "invoice_document_metadata_workspaceId_dcNumber_key"
    ON "invoice_document_metadata"("workspaceId", "dcNumber");
CREATE INDEX "invoice_document_metadata_workspaceId_idx"
    ON "invoice_document_metadata"("workspaceId");

ALTER TABLE "invoice_document_metadata"
    ADD CONSTRAINT "invoice_document_metadata_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_document_metadata"
    ADD CONSTRAINT "invoice_document_metadata_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing MunshiOS invoice numbers are workspace-unique INV-* references, so
-- replacing the prefix gives a deterministic, human-readable initial DC number.
INSERT INTO "invoice_document_metadata" ("invoiceId", "workspaceId", "dcNumber", "createdAt", "updatedAt")
SELECT
    i."id",
    i."workspaceId",
    CASE
      WHEN upper(i."invoiceNumber") LIKE 'INV-%' THEN 'DC-' || substring(upper(i."invoiceNumber") FROM 5)
      ELSE left('DC-' || regexp_replace(upper(i."invoiceNumber"), '[^A-Z0-9/_-]+', '-', 'g'), 32)
    END,
    NOW(),
    NOW()
FROM "invoices" i;
