import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { canPerformAction } from "@/lib/server/authorization";
import { getGoodsReceipt } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";
import { EditGrnSheet } from "@/components/goods-receipts/edit-grn-sheet";
import { VoidGrnButton } from "@/components/goods-receipts/void-grn-button";
import { DeleteGrnButton } from "@/components/goods-receipts/delete-grn-button";

export default async function GoodsReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, role } = await requireWorkspace();
  const grn = await getGoodsReceipt(workspaceId, id);
  if (!grn) notFound();

  const canAdjust = canPerformAction(role, "inventory.adjust");
  const isActive = grn.status === "ACTIVE";
  const canEdit = canAdjust && isActive && !grn.hasSupplierReturns;
  const canVoid = canAdjust && isActive && !grn.hasSupplierReturns;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/purchases/${grn.purchaseOrder.id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-950">
            <ArrowLeft className="h-4 w-4" /> {grn.purchaseOrder.orderNumber}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl">{grn.grnNumber}</h1>
            <StatusBadge status={grn.status} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">Received {formatDate(grn.receiptDate)} from {grn.supplier.name}</p>
        </div>
        <div className="flex gap-2">
          {canEdit && <EditGrnSheet grn={grn} />}
          {canVoid && <VoidGrnButton grnId={grn.id} grnNumber={grn.grnNumber} />}
          {canAdjust && <DeleteGrnButton grnId={grn.id} grnNumber={grn.grnNumber} />}
          <Link href={`/goods-receipts/${id}/print`} target="_blank" className="inline-flex h-9 items-center justify-center border px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
            <Printer className="mr-2 h-4 w-4" /> Print GRN
          </Link>
        </div>
      </div>

      {grn.status === "VOIDED" && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">This GRN was voided{grn.voidedAt ? ` on ${formatDate(grn.voidedAt)}` : ""}.</p>{grn.voidedReason && <p className="mt-1">Reason: {grn.voidedReason}</p>}</div>}
      {grn.hasSupplierReturns && isActive && <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">This GRN cannot be edited or voided because supplier returns reference it.</div>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader><CardTitle>Received Items</CardTitle></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Product</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Previously Received</TableHead>
                    <TableHead className="text-right">Received Now</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="pr-4 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grn.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="pl-4 font-medium">
                        {item.productName}
                        {item.sku && <span className="ml-2 font-mono text-xs text-neutral-400">{item.sku}</span>}
                      </TableCell>
                      <TableCell className="text-right">{item.orderedQuantity} {item.unit === "KG" ? "kg" : ""}</TableCell>
                      <TableCell className="text-right">{item.previouslyReceived} {item.unit === "KG" ? "kg" : ""}</TableCell>
                      <TableCell className="text-right">{item.receivedNow} {item.unit === "KG" ? "kg" : ""}</TableCell>
                      <TableCell className="text-right font-semibold">{item.acceptedQuantity} {item.unit === "KG" ? "kg" : ""}</TableCell>
                      <TableCell className="text-right">{item.remainingQuantity} {item.unit === "KG" ? "kg" : ""}</TableCell>
                      <TableCell className="text-right">{formatPKR(item.unitCost)}</TableCell>
                      <TableCell className="pr-4 text-right font-semibold">{formatPKR(item.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-none xl:sticky xl:top-6">
          <CardHeader><CardTitle>Receipt Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <SummaryRow label="GRN Number" value={grn.grnNumber} />
            <SummaryRow label="PO Reference" value={grn.purchaseOrder.orderNumber} />
            <SummaryRow label="Supplier" value={grn.supplier.name} />
            <SummaryRow label="Receipt date" value={formatDate(grn.receiptDate)} />
            {grn.receivedBy && <SummaryRow label="Received by" value={grn.receivedBy} />}
            {grn.checkedBy && <SummaryRow label="Checked by" value={grn.checkedBy} />}
            <div className="flex items-center justify-between border-t pt-4">
              <span className="font-semibold">Total received value</span>
              <span className="text-xl font-bold">{formatPKR(grn.totalAmount)}</span>
            </div>
            {grn.notes && (
              <div className="border-t pt-4">
                <p className="text-xs text-neutral-500">Notes</p>
                <p className="mt-1 text-sm text-neutral-600">{grn.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-neutral-500">{label}</span><span className="font-medium">{value}</span></div>;
}
