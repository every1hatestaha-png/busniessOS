ALTER TABLE "sales_order_items"
  ADD COLUMN "taxRate" DECIMAL(7,4),
  ADD COLUMN "taxableAmount" DECIMAL(15,2),
  ADD COLUMN "salesTaxAmount" DECIMAL(15,2);
