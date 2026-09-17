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

-- New invoices receive their DC number atomically before any detail/print page
-- can expose it. If a user has manually reserved what would have been a future
-- automatic DC number, choose the next clean number instead of failing the sale.
CREATE OR REPLACE FUNCTION create_invoice_document_metadata()
RETURNS TRIGGER AS $$
DECLARE
  base_candidate TEXT;
  candidate TEXT;
  collision_index INTEGER := 0;
  numeric_width INTEGER;
  numeric_value BIGINT;
  numeric_text TEXT;
BEGIN
  base_candidate := CASE
    WHEN upper(NEW."invoiceNumber") LIKE 'INV-%' THEN 'DC-' || substring(upper(NEW."invoiceNumber") FROM 5)
    ELSE left('DC-' || regexp_replace(upper(NEW."invoiceNumber"), '[^A-Z0-9/_-]+', '-', 'g'), 32)
  END;
  candidate := base_candidate;

  IF base_candidate ~ '^DC-[0-9]+$' THEN
    numeric_text := substring(base_candidate FROM 4);
    numeric_width := length(numeric_text);
    numeric_value := numeric_text::BIGINT;
  END IF;

  LOOP
    BEGIN
      INSERT INTO "invoice_document_metadata" ("invoiceId", "workspaceId", "dcNumber", "createdAt", "updatedAt")
      VALUES (NEW."id", NEW."workspaceId", candidate, NOW(), NOW());
      RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
      collision_index := collision_index + 1;
      IF collision_index > 9999 THEN
        RAISE EXCEPTION 'Unable to allocate a unique delivery challan number';
      END IF;

      IF numeric_value IS NOT NULL THEN
        numeric_text := (numeric_value + collision_index)::TEXT;
        candidate := 'DC-' || lpad(numeric_text, GREATEST(numeric_width, length(numeric_text)), '0');
      ELSE
        candidate := left(base_candidate, 27) || '-' || lpad(collision_index::TEXT, 4, '0');
      END IF;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_create_document_metadata
AFTER INSERT ON "invoices"
FOR EACH ROW EXECUTE FUNCTION create_invoice_document_metadata();
