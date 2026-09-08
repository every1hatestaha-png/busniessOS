-- Rename discount to discountPerUnit on sales_order_items
-- Preserve existing values by copying discount to discountPerUnit
ALTER TABLE "sales_order_items" ADD COLUMN "discountPerUnit" DECIMAL(15,2) NOT NULL DEFAULT 0;
UPDATE "sales_order_items" SET "discountPerUnit" = "discount";
ALTER TABLE "sales_order_items" DROP COLUMN "discount";