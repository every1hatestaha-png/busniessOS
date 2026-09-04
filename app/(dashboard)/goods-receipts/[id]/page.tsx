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
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
           <Link href={`/purchases/${grn.purchaseOrder.id}`} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> {grn.purchaseOrder.orderNumber}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
             <h1 className="font-mono text-xl font-semibold tracking-tight text-foreground">{grn.grnNumber}</h1>
            <StatusBadge status={grn.status} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Received {formatDate(grn.receiptDate)} from {grn.supplier.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <EditGrnSheet grn={grn} />}
          {canVoid && <VoidGrnButton grnId={grn.id} grnNumber={grn.grnNumber} />}
          <Link href={`/goods-receipts/${id}/print`} target="_blank" className="inline-flex h-7 items-center justify-center rounded-md border px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Printer className="mr-1 size-3.5" /> Print GRN
          </Link>
        </div>
      </div>

      {grn.status === "VOIDED" && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800"><p className="font-semibold">This GRN was voided{grn.voidedAt ? ` on ${formatDate(grn.voidedAt)}` : ""}.</p>{grn.voidedReason && <p className="mt-1">Reason: {grn.voidedReason}</p>}</div>}
      {grn.hasSupplierReturns && isActive && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">This GRN cannot be edited or voided because supplier returns reference it.</div>}

      <div className="grid overflow-hidden rounded-md border bg-white sm:grid-cols-4 sm:divide-x"><Fact label="PO reference" value={grn.purchaseOrder.orderNumber} mono /><Fact label="Supplier" value={grn.supplier.name} /><Fact label="Receipt date" value={formatDate(grn.receiptDate)} /><Fact label="Accepted value" value={formatPKR(grn.totalAmount)} /></div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
            <CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Receipt Lines</CardTitle><p className="text-[11px] text-slate-500">Physical delivery, accepted stock, and remaining PO capacity.</p></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow className="h-9 bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="pl-4">Product</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Prev. Accepted</TableHead>
                    <TableHead className="text-right">Received Now</TableHead>
                    <TableHead className="text-right">Accepted / Rejected</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="pr-4 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grn.items.map((item) => {
                    const isWeighted = item.ratePerKg != null;
                    return (
                    <TableRow key={item.id} className="h-11">
                      <TableCell className="py-1.5 pl-4 text-xs font-medium">
                        {item.productName}
                        {item.sku && <span className="ml-2 font-mono text-xs text-neutral-400">{item.sku}</span>}
                      </TableCell>
                      <QuantityCell value={item.orderedQuantity} unit={item.unit} />
                      <QuantityCell value={item.previouslyReceived} unit={item.unit} />
                      <QuantityCell value={item.receivedNow} unit={item.unit} />
                       <TableCell className="py-1.5 text-right text-xs"><span className="font-semibold tabular-nums">{item.acceptedQuantity} {unitLabel(item.unit)}</span>{item.receivedNow > item.acceptedQuantity && <p className="text-[10px] text-amber-700">Rejected {item.receivedNow - item.acceptedQuantity} {unitLabel(item.unit)}</p>}</TableCell>
                      <QuantityCell value={item.remainingQuantity} unit={item.unit} strong />
                      <TableCell className="py-1.5 text-right text-xs tabular-nums">
                        {isWeighted ? <span>{formatPKR(item.ratePerKg!)}/kg</span> : formatPKR(item.unitCost)}
                      </TableCell>
                      <TableCell className="py-1.5 pr-4 text-right text-xs font-semibold tabular-nums">
                        {isWeighted ? formatPKR(item.lineAmount ?? item.totalCost) : formatPKR(item.totalCost)}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="sticky top-6 gap-0 rounded-md border py-0 shadow-none ring-0">
          <CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Receipt Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 p-4 text-xs">
             <SummaryRow label="GRN Number" value={grn.grnNumber} mono />
             <SummaryRow label="PO Reference" value={grn.purchaseOrder.orderNumber} mono />
            <SummaryRow label="Supplier" value={grn.supplier.name} />
            <SummaryRow label="Receipt date" value={formatDate(grn.receiptDate)} />
            {grn.receivedBy && <SummaryRow label="Received by" value={grn.receivedBy} />}
            {grn.checkedBy && <SummaryRow label="Checked by" value={grn.checkedBy} />}
            <div className="flex items-center justify-between border-t pt-4">
              <span className="font-semibold">Total accepted value</span>
              <span className="text-lg font-semibold tabular-nums">{formatPKR(grn.totalAmount)}</span>
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

function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{label}</span><span className={`text-right font-medium tabular-nums ${mono ? "font-mono" : ""}`}>{value}</span></div>;
}

function unitLabel(unit: string) { return unit === "KG" ? "kg" : unit.toLowerCase(); }
function QuantityCell({ value, unit, strong = false }: { value: number; unit: string; strong?: boolean }) { return <TableCell className={`py-1.5 text-right text-xs tabular-nums ${strong ? "font-semibold" : "text-slate-600"}`}>{value} {unitLabel(unit)}</TableCell>; }
function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="px-4 py-3"><p className="text-[10px] text-slate-500">{label}</p><p className={`mt-0.5 text-xs font-semibold ${mono ? "font-mono" : ""}`}>{value}</p></div>; }
