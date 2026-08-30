-- AlterEnum: Add new values to existing enums
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'PURCHASE_RECEIPT';
ALTER TYPE "GeneralLedgerSourceType" ADD VALUE IF NOT EXISTS 'PURCHASE_RECEIPT';
ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'PURCHASE_RECEIPT';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'GOODS_RECEIVED';

-- CreateEnum: PricingMode
CREATE TYPE "PricingMode" AS ENUM ('UNIT', 'WEIGHT');

-- AlterTable: PurchaseOrder — add new columns
ALTER TABLE "purchase_orders" ADD COLUMN "expectedDeliveryDate" TIMESTAMP(3);
ALTER TABLE "purchase_orders" ADD COLUMN "department" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "pricingMode" "PricingMode" NOT NULL DEFAULT 'UNIT';

-- AlterTable: PurchaseOrderItem — add received quantity and weight columns
ALTER TABLE "purchase_order_items" ADD COLUMN "receivedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "purchase_order_items" ADD COLUMN "unitWeight" DECIMAL(10,3);
ALTER TABLE "purchase_order_items" ADD COLUMN "totalWeight" DECIMAL(15,3);
ALTER TABLE "purchase_order_items" ADD COLUMN "perKgRate" DECIMAL(15,2);

-- CreateTable: GoodReceivedNote
CREATE TABLE "goods_received_notes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "receivedBy" TEXT,
    "checkedBy" TEXT,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_received_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GoodReceivedNoteItem
CREATE TABLE "goods_received_note_items" (
    "id" TEXT NOT NULL,
    "goodReceivedNoteId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderedQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "acceptedQuantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(15,2) NOT NULL,
    "totalCost" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_received_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: GoodReceivedNote
CREATE UNIQUE INDEX "goods_received_notes_workspaceId_grnNumber_key" ON "goods_received_notes"("workspaceId", "grnNumber");
CREATE INDEX "goods_received_notes_workspaceId_purchaseOrderId_key" ON "goods_received_notes"("workspaceId", "purchaseOrderId");
CREATE INDEX "goods_received_notes_workspaceId_supplierId_key" ON "goods_received_notes"("workspaceId", "supplierId");

-- CreateIndex: GoodReceivedNoteItem
CREATE INDEX "goods_received_note_items_goodReceivedNoteId_key" ON "goods_received_note_items"("goodReceivedNoteId");

-- AddForeignKey: GoodReceivedNote
ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: GoodReceivedNoteItem
ALTER TABLE "goods_received_note_items" ADD CONSTRAINT "goods_received_note_items_goodReceivedNoteId_fkey" FOREIGN KEY ("goodReceivedNoteId") REFERENCES "goods_received_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_received_note_items" ADD CONSTRAINT "goods_received_note_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_received_note_items" ADD CONSTRAINT "goods_received_note_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
