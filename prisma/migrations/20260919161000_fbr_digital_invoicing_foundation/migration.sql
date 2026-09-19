CREATE TYPE "FbrEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');
CREATE TYPE "FbrSubmissionStatus" AS ENUM ('DRAFT', 'VALIDATION_FAILED', 'VALIDATED', 'SUBMITTING', 'SUBMITTED', 'FAILED', 'BLOCKED');
CREATE TYPE "FbrAttemptKind" AS ENUM ('VALIDATE', 'POST');

ALTER TABLE "workspaces" ADD COLUMN "province" TEXT;
ALTER TABLE "customers" ADD COLUMN "taxId" TEXT;
ALTER TABLE "customers" ADD COLUMN "province" TEXT;
ALTER TABLE "customers" ADD COLUMN "registrationType" TEXT;
ALTER TABLE "products" ADD COLUMN "fbrHsCode" TEXT;
ALTER TABLE "products" ADD COLUMN "fbrUom" TEXT;

CREATE TABLE "fbr_integration_configs" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "environment" "FbrEnvironment" NOT NULL DEFAULT 'SANDBOX',
  "provider" TEXT NOT NULL DEFAULT 'PRAL',
  "integratorName" TEXT,
  "defaultScenarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fbr_integration_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fbr_integration_configs_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "fbr_invoice_submissions" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "environment" "FbrEnvironment" NOT NULL,
  "status" "FbrSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
  "idempotencyKey" TEXT NOT NULL,
  "payloadSnapshot" JSONB,
  "validationResponse" JSONB,
  "submissionResponse" JSONB,
  "fbrInvoiceNumber" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "validatedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fbr_invoice_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fbr_invoice_submissions_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fbr_invoice_submissions_invoice_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "fbr_invoice_attempts" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "kind" "FbrAttemptKind" NOT NULL,
  "requestBody" JSONB,
  "responseBody" JSONB,
  "httpStatus" INTEGER,
  "succeeded" BOOLEAN NOT NULL DEFAULT false,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fbr_invoice_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fbr_invoice_attempts_submission_fkey" FOREIGN KEY ("submissionId") REFERENCES "fbr_invoice_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "fbr_integration_configs_workspaceId_key" ON "fbr_integration_configs"("workspaceId");
CREATE UNIQUE INDEX "fbr_invoice_submissions_invoiceId_key" ON "fbr_invoice_submissions"("invoiceId");
CREATE UNIQUE INDEX "fbr_invoice_submissions_workspaceId_idempotencyKey_key" ON "fbr_invoice_submissions"("workspaceId", "idempotencyKey");
CREATE INDEX "fbr_invoice_submissions_workspaceId_status_updatedAt_idx" ON "fbr_invoice_submissions"("workspaceId", "status", "updatedAt");
CREATE INDEX "fbr_invoice_submissions_workspaceId_invoiceId_idx" ON "fbr_invoice_submissions"("workspaceId", "invoiceId");
CREATE INDEX "fbr_invoice_attempts_submissionId_createdAt_idx" ON "fbr_invoice_attempts"("submissionId", "createdAt");
