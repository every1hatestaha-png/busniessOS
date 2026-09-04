import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GoodsReceiptForm } from "@/components/goods-receipts/goods-receipt-form";
import { requirePermission } from "@/lib/server/authorization";
import { getOpenPOItemsForGRN } from "@/lib/server/purchases";

export default async function ReceiveGoodsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requirePermission("financial.manage");
  const data = await getOpenPOItemsForGRN(workspaceId, id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
        <Link href={`/purchases/${id}`} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-3.5" />{data.orderNumber}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Receive Goods</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          {data.supplier.name} · {data.items.length} open line{data.items.length !== 1 ? "s" : ""}
        </p>
      </div>
      <GoodsReceiptForm purchaseOrderId={data.id} poNumber={data.orderNumber} supplierName={data.supplier.name} items={data.items} />
    </div>
  );
}
