/*
  Warnings:

  - A unique constraint covering the columns `[workspaceId,customerReturnId]` on the table `credit_notes` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "GRNStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- AlterTable
ALTER TABLE "goods_received_notes" ADD COLUMN     "status" "GRNStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_workspaceId_customerReturnId_key" ON "credit_notes"("workspaceId", "customerReturnId");

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_goodReceivedNoteId_fkey" FOREIGN KEY ("goodReceivedNoteId") REFERENCES "goods_received_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "general_ledger_entries_workspaceId_accountId_date_createdAt_id_" RENAME TO "general_ledger_entries_workspaceId_accountId_date_createdAt_idx";

-- RenameIndex
ALTER INDEX "goods_received_note_items_goodReceivedNoteId_key" RENAME TO "goods_received_note_items_goodReceivedNoteId_idx";

-- RenameIndex
ALTER INDEX "goods_received_notes_workspaceId_purchaseOrderId_key" RENAME TO "goods_received_notes_workspaceId_purchaseOrderId_idx";

-- RenameIndex
ALTER INDEX "goods_received_notes_workspaceId_supplierId_key" RENAME TO "goods_received_notes_workspaceId_supplierId_idx";
