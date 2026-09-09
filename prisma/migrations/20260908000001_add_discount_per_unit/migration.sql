-- Rename discount to discountPerUnit on sales_order_items
-- Preserve historical line totals by converting the old fixed line discount
-- into a per-unit discount. New records already use per-unit semantics.
ALTER TABLE "sales_order_items" ADD COLUMN "discountPerUnit" DECIMAL(15,2) NOT NULL DEFAULT 0;
UPDATE "sales_order_items"
SET "discountPerUnit" = CASE
  WHEN "quantity" > 0 THEN ROUND("discount" / "quantity", 2)
  ELSE 0
END;
ALTER TABLE "sales_order_items" DROP COLUMN "discount";
