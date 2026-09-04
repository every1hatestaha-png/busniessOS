import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, CalendarDays, CreditCard, PackageCheck, Phone, Printer, ReceiptText, Truck } from "lucide-react";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { getPurchase } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";
import { canPerformAction } from "@/lib/server/authorization";
import { SupplierReturnForm } from "@/components/purchases/supplier-return-form";
import { CancelPurchaseButton } from "@/components/purchases/cancel-purchase-button";
import { DeletePurchaseButton } from "@/components/purchases/delete-purchase-button";
import { EditPurchaseSheet } from "@/components/purchases/edit-purchase-sheet";

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, role } = await requireWorkspace();
  const purchase = await getPurchase(workspaceId, id);
  if (!purchase) notFound();

  const canManageFinancials = canPerformAction(role, "financial.manage");
  const canReceive = canManageFinancials && purchase.status !== "CANCELLED" && purchase.status !== "RECEIVED";
  const canEdit = canManageFinancials && (purchase.status === "DRAFT" || purchase.status === "ORDERED");
  const canDelete = canManageFinancials && purchase.status === "DRAFT";

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
           <Link href="/purchases" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Purchases
          </Link>
          <div className="flex flex-wrap items-center gap-3">
             <h1 className="font-mono text-xl font-semibold tracking-tight text-foreground">{purchase.orderNumber}</h1>
            <StatusBadge status={purchase.status} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {purchase.status.replaceAll("_", " ")} · {formatDate(purchase.date)} · {purchase.supplier.companyName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <EditPurchaseSheet purchase={purchase} />}
          {canDelete && <DeletePurchaseButton purchaseId={purchase.id} orderNumber={purchase.orderNumber} />}
          {canManageFinancials && purchase.status !== "CANCELLED" && <CancelPurchaseButton purchaseId={purchase.id} orderNumber={purchase.orderNumber} received={purchase.status === "RECEIVED" || purchase.status === "PARTIALLY_RECEIVED"} />}
          {canReceive && (
            <Link href={`/purchases/${id}/receive`} className="inline-flex h-7 items-center justify-center rounded-md bg-primary px-2.5 text-xs font-medium text-white hover:bg-primary/90">
              <Truck className="mr-1 size-3.5" /> Receive Goods
            </Link>
          )}
          <Link href={`/purchases/${id}/print`} target="_blank" className="inline-flex h-7 items-center justify-center rounded-md border px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Printer className="mr-1 size-3.5" /> Print PO
          </Link>
        </div>
      </div>

      <div className="grid overflow-hidden rounded-md border bg-white sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
        <InfoCard icon={CalendarDays} label="Order date" value={formatDate(purchase.date)} />
        <InfoCard icon={ReceiptText} label="Line items" value={`${purchase.items.length} product${purchase.items.length === 1 ? "" : "s"}`} />
        <InfoCard icon={Boxes} label="Goods received value" value={formatPKR(purchase.goodsReceivedValue)} />
        <InfoCard icon={CreditCard} label="Outstanding payable" value={formatPKR(purchase.outstanding)} />
      </div>

      {purchase.expectedDeliveryDate && (
        <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
           <CardContent className="flex items-center gap-3 px-4 py-3">
             <Truck className="h-4 w-4 text-neutral-400" />
             <span className="text-xs text-slate-600">Expected delivery: <strong>{formatDate(purchase.expectedDeliveryDate)}</strong></span>
             {purchase.department && <span className="ml-4 text-xs text-slate-600">Department: <strong>{purchase.department}</strong></span>}
          </CardContent>
        </Card>
      )}
      {canManageFinancials && purchase.status !== "CANCELLED" && purchase.goodsReceivedValue > 0 && (
         <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
           <CardContent className="p-4">
            <SupplierReturnForm
              purchaseOrderId={purchase.id}
              items={purchase.items.map((item) => ({ id: item.id, productName: item.productName, receivedQuantity: item.receivedQuantity, unit: item.unit, perKgRate: item.perKgRate, unitWeight: item.unitWeight }))}
              grns={purchase.grns.filter((grn) => grn.status === "ACTIVE").map((grn) => ({
                id: grn.id,
                grnNumber: grn.grnNumber,
                items: grn.items.map((gi) => ({
                  id: gi.id,
                  poItemId: gi.purchaseOrderItemId,
                  productName: purchase.items.find((i) => i.id === gi.purchaseOrderItemId)?.productName ?? "Item",
                  acceptedQuantity: gi.acceptedQuantity,
                  returnedQuantity: 0,
                  unitCost: gi.unitCost,
                  unit: purchase.items.find((i) => i.id === gi.purchaseOrderItemId)?.unit ?? "PIECE",
                  acceptedWeightKg: gi.acceptedWeightKg,
                  ratePerKg: gi.ratePerKg,
                })),
              }))}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
            <CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Purchase Order Lines</CardTitle></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow className="h-9 bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="pl-4">Product</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead>
                    <TableHead className="pr-4 text-right">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchase.items.map((item) => (
                    <TableRow key={item.id} className="h-11">
                      <TableCell className="py-1.5 pl-4 text-xs font-medium">
                        {item.productName}
                        {item.sku && <span className="ml-2 font-mono text-xs text-neutral-400">{item.sku}</span>}
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-xs tabular-nums">{item.quantity} {item.unit.toLowerCase()}</TableCell>
                      <TableCell className="py-1.5 text-right text-xs tabular-nums">{item.receivedQuantity} {item.unit.toLowerCase()}</TableCell>
                      <TableCell className="py-1.5 text-right text-xs font-semibold tabular-nums">{item.remainingQuantity} {item.unit.toLowerCase()}</TableCell>
                      <TableCell className="py-1.5 text-right text-xs tabular-nums">{formatPKR(item.unitCost)}</TableCell>
                      <TableCell className="py-1.5 pr-4 text-right text-xs font-semibold tabular-nums">{formatPKR(item.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {purchase.grns.length > 0 && (
            <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
              <CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Goods Receipt History</CardTitle></CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                      <TableRow className="h-9 bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="pl-4">GRN No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="pr-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchase.grns.map((grn) => (
                      <TableRow key={grn.id} className="h-11">
                        <TableCell className="pl-4 font-mono text-xs">{grn.grnNumber}</TableCell>
                        <TableCell>{formatDate(grn.receiptDate)}</TableCell>
                        <TableCell><StatusBadge status={grn.status} /></TableCell>
                         <TableCell className="py-1.5 text-right tabular-nums">{grn.items.length}</TableCell>
                         <TableCell className="py-1.5 text-right font-semibold tabular-nums">{formatPKR(grn.totalAmount)}</TableCell>
                        <TableCell className="pr-4 text-right">
                          <Link href={`/goods-receipts/${grn.id}`} className="text-xs font-medium underline-offset-4 hover:underline">View</Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

           <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
             <CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Supplier</CardTitle></CardHeader>
             <CardContent className="p-4">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                   <p className="text-xs font-semibold text-foreground">{purchase.supplier.companyName}</p>
                   <p className="mt-0.5 text-[11px] text-slate-500">{purchase.supplier.name}</p>
                </div>
                 <div className="space-y-2 text-xs text-slate-600">
                  <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-neutral-400" />{purchase.supplier.phone || "No phone provided"}</p>
                  <p className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-neutral-400" />{purchase.status === "CANCELLED" ? "Reversed" : purchase.status === "RECEIVED" ? "Fully received" : "Pending receipt"}</p>
                </div>
                <div className="border-t pt-4 sm:col-span-2">
                  <p className="text-xs text-neutral-500">Supplier payable balance</p>
                  <p className="mt-1 font-semibold">{formatPKR(purchase.supplier.currentBalance)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

           <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
             <CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Notes</CardTitle></CardHeader>
             <CardContent className="p-4">
               <p className="text-xs leading-relaxed text-slate-600">{purchase.notes || "No notes were added to this purchase."}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6">
          <SummaryCard title="Purchase Order Summary"><SummaryRow label="Subtotal" value={formatPKR(purchase.subtotal)} />{purchase.discount > 0 && <SummaryRow label="Discount" value={`- ${formatPKR(purchase.discount)}`} />}<SummaryRow label="Ordered value" value={formatPKR(purchase.total)} strong /></SummaryCard>
          <SummaryCard title="Receiving Summary"><SummaryRow label="Accepted GRN value" value={formatPKR(purchase.goodsReceivedValue)} /><SummaryRow label="Remaining order value" value={formatPKR(purchase.remainingValueToReceive)} strong /></SummaryCard>
          <SummaryCard title="Payment Summary"><SummaryRow label="Paid to supplier" value={formatPKR(purchase.paid)} /><div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950"><span className="text-xs font-medium">Outstanding payable</span><span className="text-base font-semibold tabular-nums">{formatPKR(purchase.outstanding)}</span></div><Link href={`/suppliers/${purchase.supplier.id}`} className="inline-flex h-8 w-full items-center justify-center rounded-md border text-xs font-medium text-slate-700 hover:bg-slate-50">View Supplier Khata</Link></SummaryCard>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3">
        <span className="text-slate-400"><Icon className="size-3.5" /></span>
        <div>
          <p className="text-[10px] text-slate-500">{label}</p>
          <p className="mt-0.5 text-xs font-semibold tabular-nums">{value}</p>
        </div>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader><CardContent className="space-y-3 p-4 text-xs">{children}</CardContent></Card>;
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-4 ${strong ? "border-t pt-3" : ""}`}><span className="text-slate-500">{label}</span><span className={`${strong ? "font-semibold" : "font-medium"} tabular-nums`}>{value}</span></div>;
}
