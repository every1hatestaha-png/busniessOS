import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  Landmark,
  PackageCheck,
  Plus,
  ReceiptText,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";

import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFinancialDashboard } from "@/lib/server/accounting";
import { canPerformAction } from "@/lib/server/authorization";
import { requireWorkspace } from "@/lib/server/auth";
import { getDashboardActivity } from "@/lib/server/dashboard";
import { formatDate, formatPKR, getStockStatus } from "@/lib/utils";

function KpiCard({ href, label, value, detail, icon: Icon }: { href: string; label: string; value: string; detail: string; icon: LucideIcon }) {
  return (
    <Link href={href} className="group rounded-md border bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className="flex size-7 items-center justify-center rounded border bg-slate-50 text-slate-500 group-hover:bg-white"><Icon className="size-3.5" /></span>
      </div>
      <p className="mt-3 text-[22px] font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
    </Link>
  );
}

function PanelHeading({ title, description, href, linkLabel = "View all" }: { title: string; description: string; href?: string; linkLabel?: string }) {
  return (
    <CardHeader className="flex-row items-center justify-between border-b px-4 py-3">
      <div>
        <CardTitle className="text-sm font-semibold text-slate-900">{title}</CardTitle>
        <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
      </div>
      {href && <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 focus-visible:outline-none focus-visible:underline">{linkLabel}<ArrowRight className="size-3" /></Link>}
    </CardHeader>
  );
}

function QuickAction({ href, label, detail, icon: Icon, primary = false }: { href: string; label: string; detail: string; icon: LucideIcon; primary?: boolean }) {
  return (
    <Link href={href} className={primary
      ? "flex min-h-12 items-center gap-3 rounded-md bg-primary px-3 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      : "flex min-h-12 items-center gap-3 rounded-md border bg-white px-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"}
    >
      <span className={primary ? "flex size-7 items-center justify-center rounded bg-white/15" : "flex size-7 items-center justify-center rounded bg-slate-100 text-slate-600"}><Icon className="size-3.5" /></span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
        <span className={primary ? "block truncate text-[10px] text-blue-100" : "block truncate text-[10px] text-slate-500"}>{detail}</span>
      </span>
    </Link>
  );
}

export default async function DashboardPage() {
  const { user, workspace, role } = await requireWorkspace();
  const canViewFinancials = canPerformAction(role, "financial.manage");
  const [financials, activity] = await Promise.all([
    canViewFinancials ? getFinancialDashboard(workspace.id) : Promise.resolve(null),
    getDashboardActivity(workspace.id),
  ]);
  const currentDate = new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500"><span>{workspace.name}</span><span aria-hidden="true">/</span><span>{currentDate}</span></div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-0.5 text-xs text-slate-500">Welcome back, {user.firstName ?? "team"}. Here is today&apos;s operating view.</p>
        </div>
        <Link href="/sales/new" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
          <Plus className="size-3.5" />New sales order
        </Link>
      </header>

      {financials && (
        <section aria-label="Financial overview" className="grid gap-3 lg:grid-cols-4">
          <KpiCard href="/receivables" label="Receivables" value={formatPKR(financials.receivables)} detail="Customer account balances" icon={ReceiptText} />
          <KpiCard href="/payables" label="Payables" value={formatPKR(financials.payables)} detail="Supplier account balances" icon={Banknote} />
          <KpiCard href="/accounting/cash-bank" label="Cash & Bank" value={formatPKR(financials.cashBank)} detail="Active account balances" icon={Landmark} />
          <KpiCard href="/reports/current-stock" label="Inventory Value" value={formatPKR(financials.inventoryValue)} detail="Current stock valued at cost" icon={Boxes} />
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,0.65fr)]">
        <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
          <PanelHeading title="Recent Sales" description="Latest non-cancelled customer orders" href="/sales" />
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="h-9 bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="h-9 pl-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order</TableHead>
                  <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer</TableHead>
                  <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</TableHead>
                  <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Balance</TableHead>
                  <TableHead className="h-9 pr-4 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.sales.map((sale) => (
                  <TableRow key={sale.id} className="h-11">
                    <TableCell className="py-1.5 pl-4">
                      <Link href={`/sales/${sale.id}`} className="text-xs font-semibold text-slate-900 hover:text-blue-700 hover:underline">{sale.orderNumber}</Link>
                      <p className="text-[10px] text-slate-500">{formatDate(sale.date)}</p>
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-slate-700">{sale.customerName}</TableCell>
                    <TableCell className="py-1.5"><StatusBadge status={sale.status} /></TableCell>
                    <TableCell className="py-1.5 text-right text-xs text-slate-600 tabular-nums">{formatPKR(sale.balance)}</TableCell>
                    <TableCell className="py-1.5 pr-4 text-right text-xs font-semibold text-slate-900 tabular-nums">{formatPKR(sale.total)}</TableCell>
                  </TableRow>
                ))}
                {!activity.sales.length && <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs text-slate-500">No sales orders yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
          <PanelHeading title="Quick Actions" description="Common workspace tasks" />
          <CardContent className="grid gap-2 p-3">
            <QuickAction href="/sales/new" label="New sales order" detail="Create a customer order" icon={ShoppingCart} primary />
            {canViewFinancials && <QuickAction href="/purchases/new" label="New purchase order" detail="Order from a supplier" icon={Truck} />}
            <QuickAction href="/customers" label="Customer accounts" detail="Review balances and activity" icon={Users} />
            <QuickAction href="/inventory" label="Inventory" detail="Review products and stock" icon={Boxes} />
          </CardContent>
        </Card>
      </section>

      <section className={financials ? "grid gap-4 xl:grid-cols-3" : "grid gap-4"}>
        {financials && (
          <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
            <PanelHeading title="Purchases & GRNs" description="Current receiving and supplier position" href="/purchases" linkLabel="Open purchases" />
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-xs text-slate-600"><PackageCheck className="size-3.5 text-slate-400" />Goods received this month</span>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatPKR(financials.purchasesThisMonth)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span className="flex items-center gap-2 text-xs text-slate-600"><Banknote className="size-3.5 text-slate-400" />Supplier account balances</span>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatPKR(financials.payables)}</span>
              </div>
              <Link href="/goods-receipts" className="flex h-8 items-center justify-between rounded border bg-slate-50 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100">Review goods receipts<ArrowRight className="size-3" /></Link>
            </CardContent>
          </Card>
        )}

        {financials && (
          <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
            <PanelHeading title="Receivables Attention" description="Customer balance and aging entry point" href="/receivables" linkLabel="Review aging" />
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="text-[11px] text-slate-500">Open customer account balances</p>
                 <p className="mt-1 text-xl font-semibold tracking-tight text-foreground tabular-nums">{formatPKR(financials.receivables)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t pt-3">
                <div className="rounded border bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">Sales this month</p><p className="mt-1 text-xs font-semibold tabular-nums">{formatPKR(financials.salesThisMonth)}</p></div>
                <div className="rounded border bg-slate-50 p-2.5"><p className="text-[10px] text-slate-500">Operating position</p><p className="mt-1 text-xs font-semibold tabular-nums">{formatPKR(financials.netOperatingPosition)}</p></div>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-500">Open the aging report for overdue invoice detail.</p>
            </CardContent>
          </Card>
        )}

        <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
          <PanelHeading title="Stock Attention" description="Products at or below reorder level" href="/reports/current-stock?lowStock=true" linkLabel="Stock report" />
          <CardContent className="px-4 py-1">
            {activity.lowStock.map((product) => {
              const status = getStockStatus(product.stockQuantity.toNumber(), product.reorderLevel.toNumber());
              return (
                <div key={product.id} className="flex min-h-11 items-center justify-between gap-3 border-b last:border-0">
                  <div className="min-w-0"><p className="truncate text-xs font-medium text-slate-800">{product.name}</p><p className="text-[10px] text-slate-500">{product.sku}</p></div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={status} />
                    <p className="min-w-16 text-right text-xs font-semibold text-slate-900 tabular-nums">{product.stockQuantity.toString()} <span className="font-normal text-slate-500">{product.unit.toLowerCase()}</span></p>
                  </div>
                </div>
              );
            })}
            {!activity.lowStock.length && <div className="flex min-h-32 flex-col items-center justify-center text-center"><AlertTriangle className="mb-2 size-5 text-green-700" /><p className="text-xs font-medium text-slate-700">Stock levels are clear</p><p className="mt-1 text-[10px] text-slate-500">All products are above reorder levels.</p></div>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
