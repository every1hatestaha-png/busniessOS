import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { canPerformAction } from "@/lib/server/authorization";
import { getGoodsReceiptWithHistory } from "@/lib/server/grn-history";
import { formatDate, formatPKR } from "@/lib/utils";
import { EditGrnSheet } from "@/components/goods-receipts/edit-grn-sheet";
import { VoidGrnButton } from "@/components/goods-receipts/void-grn-button";

export default async function GoodsReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, role } = await requireWorkspace();
  const grn = await getGoodsReceiptWithHistory(workspaceId, id);
  if (!grn) notFound();

  const canAdjust = canPerformAction(role, "inventory.adjust");
  const isActive = grn.status === "ACTIVE";
  const canEdit = canAdjust && isActive && !grn.hasSupplierReturns;
  const canVoid = canAdjust && isActive && !grn.hasSupplierReturns;

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] space-y-6">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
           <Link href={`/purchases/${grn.purchaseOrder.id}`} className="mb-2 inline-flex max-w-full items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5 shrink-0" /> <span className="truncate">{grn.purchaseOrder.orderNumber}</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
             <h1 className="break-all font-mono text-xl font-semibold tracking-tight text-foreground">{grn.grnNumber}</h1>
            <StatusBadge status={grn.status} />
          </div>
          <p className="mt-0.5 break-words text-xs text-slate-500">Received {formatDate(grn.receiptDate)} from {grn.supplier.name}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {canEdit && <EditGrnSheet grn={grn} />}
          {canVoid && <VoidGrnButton grnId={grn.id} grnNumber={grn.grnNumber} />}
          <Link href={`/goods-receipts/${id}/print`} className="inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Printer className="mr-1 size-3.5" /> Print GRN
          </Link>
        </div>
      </div>

      {grn.status === "VOIDED" && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800"><p className="font-semibold">This GRN was voided{grn.voidedAt ? ` on ${formatDate(grn.voidedAt)}` : ""}.</p>{grn.voidedReason && <p className="mt-1 break-words">Reason: {grn.voidedReason}</p>}</div>}
      {grn.hasSupplierReturns && isActive && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">This GRN cannot be edited or voided because supplier returns reference it.</div>}

      <div className="grid overflow-hidden rounded-md border bg-white sm:grid-cols-2 lg:grid-cols-4"><Fact label="PO reference" value={grn.purchaseOrder.orderNumber} mono /><Fact label="Supplier" value={grn.supplier.name} /><Fact label="Receipt date" value={formatDate(grn.receiptDate)} /><Fact label={grn.warehouse ? "Receiving warehouse" : "Accepted value"} value={grn.warehouse ? grn.warehouse.name + " · " + grn.warehouse.code : formatPKR(grn.totalAmount)} /></div>

      <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
            <CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Receipt Lines</CardTitle><p className="text-[11px] text-slate-500">Physical delivery, accepted stock, and remaining PO capacity.</p></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow className="h-9 bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="pl-4">Product</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    {grn.hasPreviousReceipt && <TableHead className="text-right">Prev. Accepted</TableHead>}
                    <TableHead className="text-right">Received Now</TableHead>
                    <TableHead className="text-right">Accepted / Rejected</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="pr-4 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grn.items.map((item) => {
                    const isWeighted = item.perKgRate != null;
                    return (
                    <TableRow key={item.id} className="h-11">
                      <TableCell className="py-1.5 pl-4 text-xs font-medium">
                        {item.productName}
                        {item.sku && <span className="ml-2 font-mono text-xs text-neutral-400">{item.sku}</span>}
                      </TableCell>
                      <QuantityCell value={item.orderedQuantity} unit={item.unit} />
                      {grn.hasPreviousReceipt && <QuantityCell value={item.previouslyReceived} unit={item.unit} />}
                      <TableCell className="py-1.5 text-right text-xs"><span className="tabular-nums">{item.receivedNow} {unitLabel(item.unit)}</span>{isWeighted && <p className="text-[10px] text-slate-500">{item.receivedWeightKg != null ? `${item.receivedWeightKg} kg actual` : "Missing received weight"}</p>}</TableCell>
                       <TableCell className="py-1.5 text-right text-xs"><span className="font-semibold tabular-nums">{item.acceptedQuantity} {unitLabel(item.unit)}</span>{isWeighted && <p className="text-[10px] text-slate-500">{item.acceptedWeightKg != null ? `${item.acceptedWeightKg} kg valued` : "Missing accepted weight"}</p>}{item.receivedNow > item.acceptedQuantity && <p className="text-[10px] text-amber-700">Rejected {item.receivedNow - item.acceptedQuantity} {unitLabel(item.unit)}</p>}</TableCell>
                      <QuantityCell value={item.remainingQuantity} unit={item.unit} strong />
                      <TableCell className="py-1.5 text-right text-xs tabular-nums">
                        {isWeighted ? (item.ratePerKg != null ? <span>{formatPKR(item.ratePerKg)}/kg</span> : <span className="text-amber-700">Missing rate/kg</span>) : <span>{formatPKR(item.unitCost)}/{unitLabel(item.unit)}</span>}
                      </TableCell>
                      <TableCell className="py-1.5 pr-4 text-right text-xs font-semibold tabular-nums">
                        {formatPKR(item.totalCost)}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="gap-0 2xl:sticky 2xl:top-6 rounded-md border py-0 shadow-none ring-0">
          <CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Receipt Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 p-4 text-xs">
             <SummaryRow label="GRN Number" value={grn.grnNumber} mono />
             <SummaryRow label="PO Reference" value={grn.purchaseOrder.orderNumber} mono />
            <SummaryRow label="Supplier" value={grn.supplier.name} />
            <SummaryRow label="Receipt date" value={formatDate(grn.receiptDate)} />
            {grn.receivedBy && <SummaryRow label="Received by" value={grn.receivedBy} />}
            {grn.checkedBy && <SummaryRow label="Checked by" value={grn.checkedBy} />}
            {grn.warehouse && <SummaryRow label="Receiving warehouse" value={grn.warehouse.name + " · " + grn.warehouse.code} />}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <span className="font-semibold">Total accepted value</span>
              <span className="text-lg font-semibold tabular-nums">{formatPKR(grn.totalAmount)}</span>
            </div>
            {grn.notes && (
              <div className="border-t pt-4">
                <p className="text-xs text-neutral-500">Notes</p>
                <p className="mt-1 break-words text-sm text-neutral-600">{grn.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex min-w-0 items-start justify-between gap-4"><span className="shrink-0 text-slate-500">{label}</span><span className={`min-w-0 break-words text-right font-medium tabular-nums ${mono ? "break-all font-mono" : ""}`}>{value}</span></div>;
}

function unitLabel(unit: string) { return unit === "KG" ? "kg" : unit.toLowerCase(); }
function QuantityCell({ value, unit, strong = false }: { value: number; unit: string; strong?: boolean }) { return <TableCell className={`py-1.5 text-right text-xs tabular-nums ${strong ? "font-semibold" : "text-slate-600"}`}>{value} {unitLabel(unit)}</TableCell>; }
function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="min-w-0 border-b px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-[10px] text-slate-500">{label}</p><p className={`mt-0.5 break-words text-xs font-semibold ${mono ? "break-all font-mono" : ""}`}>{value}</p></div>; }
