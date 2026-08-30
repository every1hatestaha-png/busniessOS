import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { GoodsReceiptForm } from "@/components/goods-receipts/goods-receipt-form";
import { requirePermission } from "@/lib/server/authorization";
import { getOpenPOItemsForGRN } from "@/lib/server/purchases";

export default async function ReceiveGoodsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requirePermission("financial.manage");
  const data = await getOpenPOItemsForGRN(workspaceId, id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href={`/purchases/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
          <ChevronLeft className="h-4 w-4" /> Back to {data.orderNumber}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Receive Goods</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Supplier: {data.supplier.name} — {data.items.length} item{data.items.length !== 1 ? "s" : ""} remaining
        </p>
      </div>
      <GoodsReceiptForm purchaseOrderId={data.id} poNumber={data.orderNumber} items={data.items} />
    </div>
  );
}
