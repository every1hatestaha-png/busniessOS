import Link from "next/link";

import { PageHeader } from "@/components/business/page-header";
import { StatusBadge } from "@/components/business/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { listAllGoodsReceipts } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function GoodsReceiptsPage() {
  const { workspaceId } = await requireWorkspace();
  const receipts = await listAllGoodsReceipts(workspaceId);
  return <div className="space-y-6"><PageHeader title="Goods Received Notes" description="Persisted accepted receipts that created inventory and supplier liability." /><section className="overflow-hidden border bg-white"><div className="border-b p-4 text-sm text-neutral-500">Latest 500 GRNs. Open a purchase order to receive remaining goods.</div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>GRN</TableHead><TableHead>Date</TableHead><TableHead>PO</TableHead><TableHead>Supplier</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Accepted qty</TableHead><TableHead className="text-right">Accepted value</TableHead></TableRow></TableHeader><TableBody>{receipts.map((receipt) => <TableRow key={receipt.id}><TableCell><Link href={`/goods-receipts/${receipt.id}`} className="font-mono text-xs font-semibold hover:underline">{receipt.grnNumber}</Link></TableCell><TableCell>{formatDate(receipt.receiptDate)}</TableCell><TableCell>{receipt.orderNumber}</TableCell><TableCell>{receipt.supplierName}</TableCell><TableCell><StatusBadge status={receipt.status} /></TableCell><TableCell className="text-right">{receipt.totalAccepted}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatPKR(receipt.totalAmount)}</TableCell></TableRow>)}{!receipts.length && <TableRow><TableCell colSpan={7} className="py-10 text-center text-neutral-500">No GRNs posted.</TableCell></TableRow>}</TableBody></Table></div></section></div>;
}
