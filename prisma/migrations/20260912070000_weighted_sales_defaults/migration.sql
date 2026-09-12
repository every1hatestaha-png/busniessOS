ALTER TABLE "products" ADD COLUMN "defaultWeightKg" DECIMAL(10,3);
ALTER TABLE "sales_order_items" ADD COLUMN "pricingMode" "PricingMode" NOT NULL DEFAULT 'UNIT', ADD COLUMN "unitWeight" DECIMAL(10,3), ADD COLUMN "totalWeight" DECIMAL(15,3), ADD COLUMN "perKgRate" DECIMAL(15,2);
