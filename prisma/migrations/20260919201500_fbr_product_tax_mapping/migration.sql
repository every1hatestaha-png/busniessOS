ALTER TABLE "products"
  ADD COLUMN "fbrUomId" INTEGER,
  ADD COLUMN "fbrTransactionTypeId" INTEGER,
  ADD COLUMN "fbrTransactionTypeDesc" TEXT,
  ADD COLUMN "fbrRateId" INTEGER,
  ADD COLUMN "fbrRateDesc" TEXT,
  ADD COLUMN "fbrRateValue" DECIMAL(7,4),
  ADD COLUMN "fbrReferenceVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "fbrReferenceVerifiedForDate" TIMESTAMP(3),
  ADD COLUMN "fbrReferenceProvinceCode" INTEGER,
  ADD COLUMN "fbrReferenceProvinceDesc" TEXT;

ALTER TABLE "sales_order_items"
  ADD COLUMN "fbrHsCode" TEXT,
  ADD COLUMN "fbrUom" TEXT,
  ADD COLUMN "fbrUomId" INTEGER,
  ADD COLUMN "fbrTransactionTypeId" INTEGER,
  ADD COLUMN "fbrSaleType" TEXT,
  ADD COLUMN "fbrRateId" INTEGER,
  ADD COLUMN "fbrRateDesc" TEXT,
  ADD COLUMN "fbrRateValue" DECIMAL(7,4),
  ADD COLUMN "fbrReferenceVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "fbrReferenceVerifiedForDate" TIMESTAMP(3),
  ADD COLUMN "fbrReferenceProvinceCode" INTEGER,
  ADD COLUMN "fbrReferenceProvinceDesc" TEXT;
