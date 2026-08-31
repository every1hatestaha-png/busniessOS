import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, CreditCard, MapPin, Phone, ReceiptText } from "lucide-react";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { getSale } from "@/lib/server/sales";
import { formatDate, formatPKR } from "@/lib/utils";
import { CancelSaleButton } from "@/components/sales/cancel-sale-button";
import { CustomerReturnForm } from "@/components/sales/customer-return-form";
import { canPerformAction } from "@/lib/server/authorization";

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, role } = await requireWorkspace();
  const sale = await getSale(workspaceId, id);
  if (!sale) notFound();
  const lineDiscounts = sale.items.reduce((sum, item) => sum + item.discount, 0);
  const orderDiscount = Math.max(0, sale.discount - lineDiscounts);
  const canManageFinancials = canPerformAction(role, "financial.manage");

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><Link href="/sales" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-950"><ArrowLeft className="h-4 w-4" /> Sales orders</Link><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl">{sale.orderNumber}</h1><StatusBadge status={sale.status} /></div><p className="mt-1 text-sm text-neutral-500">Created {formatDate(sale.date)} for {sale.customer.companyName}</p></div>
        <div className="flex gap-2">{sale.status !== "CANCELLED" && canManageFinancials && <CancelSaleButton saleId={sale.id} />}<Link href="/sales/new" className="inline-flex h-9 items-center justify-center border bg-neutral-950 px-4 text-sm font-semibold text-white hover:bg-neutral-800">Create another order</Link></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard icon={CalendarDays} label="Order date" value={formatDate(sale.date)} />
        <InfoCard icon={ReceiptText} label="Line items" value={`${sale.items.length} product${sale.items.length === 1 ? "" : "s"}`} />
        <InfoCard icon={CreditCard} label="Paid" value={formatPKR(sale.paidAmount)} />
        <InfoCard icon={Building2} label="Balance due" value={formatPKR(sale.balanceAmount)} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="shadow-none"><CardHeader><CardTitle>Order items</CardTitle></CardHeader><CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-4">Product</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Unit price</TableHead><TableHead className="text-right">Discount</TableHead><TableHead className="pr-4 text-right">Line total</TableHead></TableRow></TableHeader><TableBody>{sale.items.map((item) => <TableRow key={item.id}><TableCell className="pl-4 font-medium">{item.productName}</TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell className="text-right">{formatPKR(item.unitPrice)}</TableCell><TableCell className="text-right text-neutral-600">{formatPKR(item.discount)}</TableCell><TableCell className="pr-4 text-right font-semibold">{formatPKR(item.total)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>

          <Card className="shadow-none"><CardHeader><CardTitle>Customer</CardTitle></CardHeader><CardContent><div className="grid gap-5 sm:grid-cols-2"><div><p className="font-semibold text-neutral-950">{sale.customer.companyName}</p><p className="mt-1 text-sm text-neutral-500">{sale.customer.name}</p></div><div className="space-y-2 text-sm text-neutral-600"><p className="flex items-center gap-2"><Phone className="h-4 w-4 text-neutral-400" />{sale.customer.phone || "No phone provided"}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-neutral-400" />{sale.customer.address || "No address provided"}</p></div><div className="grid grid-cols-2 gap-4 border-t pt-4 sm:col-span-2"><div><p className="text-xs text-neutral-500">Account balance</p><p className="mt-1 font-semibold">{formatPKR(sale.customer.currentBalance)}</p></div><div><p className="text-xs text-neutral-500">Credit limit</p><p className="mt-1 font-semibold">{formatPKR(sale.customer.creditLimit)}</p></div></div></div></CardContent></Card>

          <Card className="shadow-none"><CardHeader><CardTitle>Order notes</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-neutral-600">{sale.notes || "No notes were added to this order."}</p></CardContent></Card>
          {sale.status !== "CANCELLED" && canManageFinancials && <Card className="shadow-none"><CardContent className="pt-5"><CustomerReturnForm salesOrderId={sale.id} items={sale.items.map((item) => ({ id: item.id, productName: item.productName, quantity: item.quantity }))} /></CardContent></Card>}
        </div>

        <Card className="shadow-none xl:sticky xl:top-6"><CardHeader><CardTitle>Payment summary</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><SummaryRow label="Subtotal" value={formatPKR(sale.subtotal)} /><SummaryRow label="Line discounts" value={`- ${formatPKR(lineDiscounts)}`} /><SummaryRow label="Order discount" value={`- ${formatPKR(orderDiscount)}`} /><div className="flex items-center justify-between border-t pt-4"><span className="font-semibold">Order total</span><span className="text-xl font-bold">{formatPKR(sale.total)}</span></div><SummaryRow label="Amount paid" value={formatPKR(sale.paidAmount)} /><div className="mt-2 flex items-center justify-between border bg-neutral-950 p-4 text-white"><span className="font-medium">Balance due</span><span className="text-lg font-bold">{formatPKR(sale.balanceAmount)}</span></div>{sale.invoice && <Link href={`/invoices/${sale.invoice.id}`} className="inline-flex w-full items-center justify-center border px-3 py-2 font-semibold text-neutral-700 hover:bg-neutral-50">View invoice {sale.invoice.number}</Link>}</CardContent></Card>
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
