import { PageHeader } from "@/components/business/page-header";
import { GoodsReceiptList } from "@/components/goods-receipts/goods-receipt-list";
import { requireWorkspace } from "@/lib/server/auth";
import { listAllGoodsReceipts } from "@/lib/server/purchases";

export default async function GoodsReceiptsPage() {
  const { workspaceId } = await requireWorkspace();
  const receipts = await listAllGoodsReceipts(workspaceId);
  return <div className="mx-auto max-w-[1600px] space-y-6"><PageHeader title="Goods Receipts" description="Posted receipts, accepted quantities, and supplier liability." /><GoodsReceiptList receipts={receipts} /></div>;
}
