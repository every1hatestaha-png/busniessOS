ALTER TABLE "fbr_integration_configs"
  ADD COLUMN "hsUomAnnexureId" INTEGER,
  ADD COLUMN "hsUomAnnexureConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "hsUomAnnexureConfirmedBy" TEXT,
  ADD COLUMN "hsUomAnnexureReference" TEXT;

ALTER TABLE "products"
  ADD COLUMN "fbrHsUomVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "fbrHsUomAnnexureId" INTEGER;

ALTER TABLE "sales_order_items"
  ADD COLUMN "fbrHsUomVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "fbrHsUomAnnexureId" INTEGER;
