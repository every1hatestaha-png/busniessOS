-- CreateEnum
CREATE TYPE "SupplierReturnStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- AlterTable: Product - change stockQuantity and reorderLevel from Int to Decimal
ALTER TABLE "products" ALTER COLUMN "stockQuantity" SET DATA TYPE DECIMAL(15,4) USING "stockQuantity"::DECIMAL(15,4);
ALTER TABLE "products" ALTER COLUMN "stockQuantity" SET DEFAULT 0;
ALTER TABLE "products" ALTER COLUMN "reorderLevel" SET DATA TYPE DECIMAL(15,4) USING "reorderLevel"::DECIMAL(15,4);
ALTER TABLE "products" ALTER COLUMN "reorderLevel" SET DEFAULT 0;

-- AlterTable: PurchaseOrderItem - change quantity and receivedQuantity from Int to Decimal
ALTER TABLE "purchase_order_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(15,4) USING "quantity"::DECIMAL(15,4);
ALTER TABLE "purchase_order_items" ALTER COLUMN "receivedQuantity" SET DATA TYPE DECIMAL(15,4) USING "receivedQuantity"::DECIMAL(15,4);
ALTER TABLE "purchase_order_items" ALTER COLUMN "receivedQuantity" SET DEFAULT 0;

-- AlterTable: GoodReceivedNoteItem - change orderedQuantity, receivedQuantity, acceptedQuantity from Int to Decimal
ALTER TABLE "goods_received_note_items" ALTER COLUMN "orderedQuantity" SET DATA TYPE DECIMAL(15,4) USING "orderedQuantity"::DECIMAL(15,4);
ALTER TABLE "goods_received_note_items" ALTER COLUMN "receivedQuantity" SET DATA TYPE DECIMAL(15,4) USING "receivedQuantity"::DECIMAL(15,4);
ALTER TABLE "goods_received_note_items" ALTER COLUMN "acceptedQuantity" SET DATA TYPE DECIMAL(15,4) USING "acceptedQuantity"::DECIMAL(15,4);

-- AlterTable: InventoryTransaction - change quantityChanged from Int to Decimal
ALTER TABLE "inventory_transactions" ALTER COLUMN "quantityChanged" SET DATA TYPE DECIMAL(15,4) USING "quantityChanged"::DECIMAL(15,4);

-- AlterTable: SalesOrderItem - change quantity from Int to Decimal
ALTER TABLE "sales_order_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(15,4) USING "quantity"::DECIMAL(15,4);

-- AlterTable: CustomerReturnItem - change quantity from Int to Decimal
ALTER TABLE "customer_return_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(15,4) USING "quantity"::DECIMAL(15,4);

-- AlterTable: SupplierReturnItem - change quantity from Int to Decimal, add goodReceivedNoteItemId
ALTER TABLE "supplier_return_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(15,4) USING "quantity"::DECIMAL(15,4);
ALTER TABLE "supplier_return_items" ADD COLUMN "goodReceivedNoteItemId" TEXT;

-- AlterTable: SupplierReturn - add status and goodReceivedNoteId
ALTER TABLE "supplier_returns" ADD COLUMN "status" "SupplierReturnStatus" NOT NULL DEFAULT 'POSTED';
ALTER TABLE "supplier_returns" ADD COLUMN "goodReceivedNoteId" TEXT;
