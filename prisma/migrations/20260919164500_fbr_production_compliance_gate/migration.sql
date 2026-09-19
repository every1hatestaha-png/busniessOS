ALTER TABLE "fbr_integration_configs"
  ADD COLUMN "integratorLicenseNo" TEXT,
  ADD COLUMN "productionApprovedAt" TIMESTAMP(3),
  ADD COLUMN "productionApprovedBy" TEXT;
