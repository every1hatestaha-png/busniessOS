import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Phone, Plus, ReceiptText } from "lucide-react";

import { StatusBadge } from "@/components/business/status-badge";
import { CancelSaleButton } from "@/components/sales/cancel-sale-button";
import { CustomerReturnForm } from "@/components/sales/customer-return-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canPerformAction } from "@/lib/server/authorization";
import { requireWorkspace } from "@/lib/server/auth";
import { getSale } from "@/lib/server/sales";
import { cn, formatDate, formatPKR } from "@/lib/utils";

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, role } = await requireWorkspace();
  const sale = await getSale(workspaceId, id);
  if (!sale) notFound();
  const lineDiscounts = sale.items.reduce((sum, item) => sum + item.discount, 0);
  const orderDiscount = Math.max(0, sale.discount - lineDiscounts);
  const canManageFinancials = canPerformAction(role, "financial.manage");

  return <div className="mx-auto max-w-[1600px] space-y-6">
    <header className="flex items-end justify-between gap-4"><div><Link href="/sales" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Sales</Link><div className="flex items-center gap-2"><h1 className="font-mono text-xl font-semibold tracking-tight text-foreground">{sale.orderNumber}</h1><StatusBadge status={sale.status} /></div><p className="mt-0.5 text-xs text-muted-foreground">{formatDate(sale.date)} · {sale.customer.companyName}</p></div><div className="flex items-center gap-2">{sale.status !== "CANCELLED" && canManageFinancials && <CancelSaleButton saleId={sale.id} orderNumber={sale.orderNumber} />}<Link href="/sales/new" className={cn(buttonVariants({ size: "sm" }), "gap-1")}><Plus className="size-3" />New Sale</Link></div></header>

    <div className="grid overflow-hidden rounded-md border bg-white sm:grid-cols-4 sm:divide-x"><Fact icon={CalendarDays} label="Order date" value={formatDate(sale.date)} /><Fact icon={ReceiptText} label="Line items" value={`${sale.items.length} product${sale.items.length === 1 ? "" : "s"}`} /><Fact label="Paid" value={formatPKR(sale.paidAmount)} /><Fact label="Balance due" value={formatPKR(sale.balanceAmount)} attention={sale.balanceAmount > 0} /></div>

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Sale Items</CardTitle></CardHeader><CardContent className="px-0"><Table><TableHeader><TableRow className="h-9 bg-slate-50/80 hover:bg-slate-50/80"><TableHead className="h-9 pl-4 text-[11px] uppercase tracking-wide text-slate-500">Product</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Quantity</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Unit price</TableHead><TableHead className="h-9 text-right text-[11px] uppercase tracking-wide text-slate-500">Discount</TableHead><TableHead className="h-9 pr-4 text-right text-[11px] uppercase tracking-wide text-slate-500">Line total</TableHead></TableRow></TableHeader><TableBody>{sale.items.map((item) => <TableRow key={item.id} className="h-11"><TableCell className="py-1.5 pl-4"><p className="text-xs font-medium">{item.productName}</p>{item.sku && <p className="font-mono text-[10px] text-slate-500">{item.sku}</p>}</TableCell><TableCell className="py-1.5 text-right text-xs tabular-nums">{item.quantity.toString()}</TableCell><TableCell className="py-1.5 text-right text-xs tabular-nums">{formatPKR(item.unitPrice)}</TableCell><TableCell className="py-1.5 text-right text-xs text-slate-600 tabular-nums">{formatPKR(item.discount)}</TableCell><TableCell className="py-1.5 pr-4 text-right text-xs font-semibold tabular-nums">{formatPKR(item.total)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>

        <div className="grid gap-4 lg:grid-cols-2"><Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Customer</CardTitle></CardHeader><CardContent className="space-y-3 p-4"><div><p className="text-xs font-semibold text-slate-900">{sale.customer.companyName}</p><p className="text-[11px] text-slate-500">{sale.customer.name}</p></div><p className="flex items-center gap-2 text-xs text-slate-600"><Phone className="size-3.5 text-slate-400" />{sale.customer.phone || "No phone provided"}</p><p className="flex items-center gap-2 text-xs text-slate-600"><MapPin className="size-3.5 text-slate-400" />{sale.customer.address || "No address provided"}</p><div className="grid grid-cols-2 gap-3 border-t pt-3"><MiniFact label="Account balance" value={formatPKR(sale.customer.currentBalance)} /><MiniFact label="Credit limit" value={sale.customer.creditLimit > 0 ? formatPKR(sale.customer.creditLimit) : "Not configured"} /></div></CardContent></Card><Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Order Notes</CardTitle></CardHeader><CardContent className="p-4"><p className="text-xs leading-relaxed text-slate-600">{sale.notes || "No notes were added to this order."}</p></CardContent></Card></div>
        {sale.status !== "CANCELLED" && canManageFinancials && <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardContent className="p-4"><CustomerReturnForm salesOrderId={sale.id} items={sale.items.map((item) => ({ id: item.id, productName: item.productName, quantity: item.quantity.toNumber() }))} /></CardContent></Card>}
      </div>

       <Card className="sticky top-6 gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Payment Summary</CardTitle></CardHeader><CardContent className="space-y-3 p-4 text-xs"><SummaryRow label="Subtotal" value={formatPKR(sale.subtotal)} /><SummaryRow label="Line discounts" value={`- ${formatPKR(lineDiscounts)}`} /><SummaryRow label="Order discount" value={`- ${formatPKR(orderDiscount)}`} /><div className="flex items-center justify-between border-t pt-3"><span className="font-semibold">Order total</span><span className="text-lg font-semibold tabular-nums">{formatPKR(sale.total)}</span></div><SummaryRow label="Amount paid" value={formatPKR(sale.paidAmount)} /><div className={`flex items-center justify-between rounded-md border p-3 ${sale.balanceAmount > 0 ? "border-amber-200 bg-amber-50 text-amber-950" : "border-green-200 bg-green-50 text-green-900"}`}><span className="font-medium">Balance due</span><span className="text-base font-semibold tabular-nums">{formatPKR(sale.balanceAmount)}</span></div>{sale.invoice && <Link href={`/invoices/${sale.invoice.id}`} className="inline-flex h-8 w-full items-center justify-center rounded-md border text-xs font-medium text-slate-700 hover:bg-slate-50">View Invoice {sale.invoice.number}</Link>}</CardContent></Card>
    </div>
  </div>;
}

function Fact({ icon: Icon, label, value, attention = false }: { icon?: typeof CalendarDays; label: string; value: string; attention?: boolean }) { return <div className="flex items-center gap-2.5 px-4 py-3">{Icon && <Icon className="size-3.5 text-slate-400" />}<div><p className="text-[10px] text-slate-500">{label}</p><p className={`mt-0.5 text-xs font-semibold tabular-nums ${attention ? "text-amber-700" : "text-slate-900"}`}>{value}</p></div></div>; }
function MiniFact({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] text-slate-500">{label}</p><p className="mt-0.5 text-xs font-semibold tabular-nums">{value}</p></div>; }
function SummaryRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium tabular-nums">{value}</span></div>; }
