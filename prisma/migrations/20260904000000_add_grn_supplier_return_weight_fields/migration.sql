-- AlterTable: GoodReceivedNoteItem - add weight fields
ALTER TABLE "goods_received_note_items" ADD COLUMN "receivedWeightKg" DECIMAL(15,3);
ALTER TABLE "goods_received_note_items" ADD COLUMN "acceptedWeightKg" DECIMAL(15,3);
ALTER TABLE "goods_received_note_items" ADD COLUMN "ratePerKg" DECIMAL(15,2);
ALTER TABLE "goods_received_note_items" ADD COLUMN "lineAmount" DECIMAL(15,2);

-- AlterTable: SupplierReturnItem - add weight fields
ALTER TABLE "supplier_return_items" ADD COLUMN "returnedWeightKg" DECIMAL(15,3);
ALTER TABLE "supplier_return_items" ADD COLUMN "ratePerKg" DECIMAL(15,2);
