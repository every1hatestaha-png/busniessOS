CREATE TABLE "invoice_document_versions" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_document_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoice_document_versions_invoiceId_version_key"
  ON "invoice_document_versions"("invoiceId", "version");

CREATE INDEX "invoice_document_versions_workspaceId_invoiceId_idx"
  ON "invoice_document_versions"("workspaceId", "invoiceId");

ALTER TABLE "invoice_document_versions"
  ADD CONSTRAINT "invoice_document_versions_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_document_versions"
  ADD CONSTRAINT "invoice_document_versions_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
