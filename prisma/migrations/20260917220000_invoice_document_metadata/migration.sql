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

-- Reserve a clean DC number for every existing invoice. Invoice numbers are
-- workspace-unique, so replacing the normal INV- prefix keeps DC numbers unique.
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

-- New invoices receive their DC number atomically even before the first print.
CREATE OR REPLACE FUNCTION create_invoice_document_metadata()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "invoice_document_metadata" ("invoiceId", "workspaceId", "dcNumber", "createdAt", "updatedAt")
  VALUES (
    NEW."id",
    NEW."workspaceId",
    CASE
      WHEN upper(NEW."invoiceNumber") LIKE 'INV-%' THEN 'DC-' || substring(upper(NEW."invoiceNumber") FROM 5)
      ELSE left('DC-' || regexp_replace(upper(NEW."invoiceNumber"), '[^A-Z0-9/_-]+', '-', 'g'), 32)
    END,
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_create_document_metadata
AFTER INSERT ON "invoices"
FOR EACH ROW EXECUTE FUNCTION create_invoice_document_metadata();
