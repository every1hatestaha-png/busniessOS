CREATE TABLE "fbr_integration_credentials" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "environment" "FbrEnvironment" NOT NULL,
  "tokenEncrypted" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "verifiedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "fbr_integration_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fbr_integration_credentials_workspaceId_environment_key"
ON "fbr_integration_credentials"("workspaceId", "environment");

CREATE INDEX "fbr_integration_credentials_workspaceId_updatedAt_idx"
ON "fbr_integration_credentials"("workspaceId", "updatedAt");

ALTER TABLE "fbr_integration_credentials"
ADD CONSTRAINT "fbr_integration_credentials_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
