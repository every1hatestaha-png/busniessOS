import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, CalendarDays, CreditCard, PackageCheck, Phone, ReceiptText } from "lucide-react";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { getPurchase } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requireWorkspace();
  const purchase = await getPurchase(workspaceId, id);
  if (!purchase) notFound();
  const receiptStatus = purchase.status === "CANCELLED" ? "Reversed — stock removed from inventory" : "Received into inventory";

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><Link href="/purchases" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-950"><ArrowLeft className="h-4 w-4" /> Purchases</Link><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl">{purchase.orderNumber}</h1><StatusBadge status={purchase.status} /></div><p className="mt-1 text-sm text-neutral-500">Received {formatDate(purchase.date)} from {purchase.supplier.companyName}</p></div>
        <div className="flex gap-2"><Link href="/purchases/new" className="inline-flex h-9 items-center justify-center border bg-neutral-950 px-4 text-sm font-semibold text-white hover:bg-neutral-800">Receive another</Link></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard icon={CalendarDays} label="Order date" value={formatDate(purchase.date)} />
        <InfoCard icon={ReceiptText} label="Line items" value={`${purchase.items.length} product${purchase.items.length === 1 ? "" : "s"}`} />
        <InfoCard icon={CreditCard} label="Paid" value={formatPKR(purchase.paid)} />
        <InfoCard icon={Boxes} label="Outstanding" value={formatPKR(purchase.outstanding)} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="shadow-none"><CardHeader><CardTitle>Line items</CardTitle></CardHeader><CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-4">Product</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Unit cost</TableHead><TableHead className="pr-4 text-right">Line total</TableHead></TableRow></TableHeader><TableBody>{purchase.items.map((item) => <TableRow key={item.id}><TableCell className="pl-4 font-medium">{item.productName}{item.sku && <span className="ml-2 font-mono text-xs text-neutral-400">{item.sku}</span>}</TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell className="text-right">{formatPKR(item.unitCost)}</TableCell><TableCell className="pr-4 text-right font-semibold">{formatPKR(item.total)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>

          <Card className="shadow-none"><CardHeader><CardTitle>Supplier</CardTitle></CardHeader><CardContent><div className="grid gap-5 sm:grid-cols-2"><div><p className="font-semibold text-neutral-950">{purchase.supplier.companyName}</p><p className="mt-1 text-sm text-neutral-500">{purchase.supplier.name}</p></div><div className="space-y-2 text-sm text-neutral-600"><p className="flex items-center gap-2"><Phone className="h-4 w-4 text-neutral-400" />{purchase.supplier.phone || "No phone provided"}</p><p className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-neutral-400" />{receiptStatus}</p></div><div className="border-t pt-4 sm:col-span-2"><p className="text-xs text-neutral-500">Supplier payable balance</p><p className="mt-1 font-semibold">{formatPKR(purchase.supplier.currentBalance)}</p></div></div></CardContent></Card>

          <Card className="shadow-none"><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-neutral-600">{purchase.notes || "No notes were added to this purchase."}</p></CardContent></Card>
        </div>

        <Card className="shadow-none xl:sticky xl:top-6"><CardHeader><CardTitle>Payment summary</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><SummaryRow label="Subtotal" value={formatPKR(purchase.subtotal)} />{purchase.discount > 0 && <SummaryRow label="Discount" value={`- ${formatPKR(purchase.discount)}`} />}<div className="flex items-center justify-between border-t pt-4"><span className="font-semibold">Purchase total</span><span className="text-xl font-bold">{formatPKR(purchase.total)}</span></div><SummaryRow label="Amount paid" value={formatPKR(purchase.paid)} />{purchase.paid > 0 && <p className="text-xs text-neutral-500">Includes any payment recorded on receipt.</p>}<div className="mt-2 flex items-center justify-between border bg-neutral-950 p-4 text-white"><span className="font-medium">Outstanding</span><span className="text-lg font-bold">{formatPKR(purchase.outstanding)}</span></div><Link href={`/suppliers/${purchase.supplier.id}`} className="inline-flex w-full items-center justify-center border px-3 py-2 font-semibold text-neutral-700 hover:bg-neutral-50">View supplier khata</Link></CardContent></Card>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <Card size="sm" className="shadow-none"><CardContent className="flex items-center gap-3"><span className="rounded-lg bg-neutral-100 p-2 text-neutral-600"><Icon className="h-4 w-4" /></span><div><p className="text-xs text-neutral-500">{label}</p><p className="mt-0.5 font-semibold">{value}</p></div></CardContent></Card>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-neutral-500">{label}</span><span className="font-medium">{value}</span></div>;
}
