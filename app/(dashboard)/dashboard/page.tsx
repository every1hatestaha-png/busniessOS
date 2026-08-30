import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  CircleDollarSign,
  HandCoins,
  Landmark,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { getFinancialDashboard } from "@/lib/server/accounting";
import { getDashboardActivity } from "@/lib/server/dashboard";
import { formatDate, formatPKR, getStockStatus } from "@/lib/utils";

function FinancialMetric({ href, label, value, detail, icon: Icon, featured = false }: { href: string; label: string; value: string; detail: string; icon: LucideIcon; featured?: boolean }) {
  return (
    <Link href={href} className={featured ? "group border border-neutral-700 bg-neutral-900 p-5 text-white transition hover:bg-neutral-800" : "group border bg-white p-4 transition hover:border-neutral-400 hover:bg-neutral-50"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={featured ? "text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400" : "text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500"}>{label}</p>
          <p className={featured ? "mt-3 text-3xl font-bold tracking-tight tabular-nums" : "mt-2 text-xl font-bold tracking-tight tabular-nums"}>{value}</p>
        </div>
        <span className={featured ? "border border-neutral-700 p-2 text-neutral-300" : "bg-neutral-100 p-2 text-neutral-600 group-hover:bg-white"}><Icon className="h-4 w-4" /></span>
      </div>
      <div className={featured ? "mt-5 flex items-center justify-between border-t border-neutral-700 pt-3 text-xs text-neutral-400" : "mt-3 flex items-center justify-between text-xs text-neutral-500"}>
        <span>{detail}</span><ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const { user, workspace } = await requireWorkspace();
  const [financials, activity] = await Promise.all([
    getFinancialDashboard(workspace.id),
    getDashboardActivity(workspace.id),
  ]);
  const currentDate = new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="overflow-hidden border bg-neutral-950 px-5 py-5 text-white md:px-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">{currentDate}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">Financial command center</h1>
            <p className="mt-1.5 text-sm text-neutral-400">{workspace.name} operating position for {user.firstName ?? "your team"}.</p>
          </div>
          <Link href="/sales/new" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200">
            New sales order <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.2fr_2fr]">
        <FinancialMetric href="/reports/profit-loss" label="Net Operating Position" value={formatPKR(financials.netOperatingPosition)} detail="Cash + receivables + stock - payables" icon={ChartNoAxesCombined} featured />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FinancialMetric href="/receivables" label="Receivables" value={formatPKR(financials.receivables)} detail="Outstanding invoices" icon={HandCoins} />
          <FinancialMetric href="/payables" label="Payables" value={formatPKR(financials.payables)} detail="Accepted GRN liability" icon={Banknote} />
          <FinancialMetric href="/reports/current-stock" label="Inventory" value={formatPKR(financials.inventoryValue)} detail="Current stock at cost" icon={Boxes} />
          <FinancialMetric href="/accounting/cash-bank" label="Cash & Bank" value={formatPKR(financials.cashBank)} detail="Available account balances" icon={Landmark} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <FinancialMetric href="/sales" label="Sales This Month" value={formatPKR(financials.salesThisMonth)} detail="Non-cancelled orders" icon={ShoppingBag} />
        <FinancialMetric href="/purchases" label="Goods Received This Month" value={formatPKR(financials.purchasesThisMonth)} detail="Accepted GRN value" icon={PackageCheck} />
        <FinancialMetric href="/reports/profit-loss" label="Expenses" value={formatPKR(financials.expensesThisMonth)} detail="This month" icon={ReceiptText} />
        <FinancialMetric href="/reports/profit-loss" label="Gross Profit" value={formatPKR(financials.grossProfit)} detail="This month" icon={TrendingUp} />
        <FinancialMetric href="/reports/profit-loss" label="Net Profit" value={formatPKR(financials.netProfit)} detail="After operating expenses" icon={CircleDollarSign} />
        <FinancialMetric href="/reports/current-stock?lowStock=true" label="Low Stock" value={String(financials.lowStockCount)} detail="Products at reorder level" icon={AlertTriangle} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.7fr)]">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>Recent sales</CardTitle><p className="mt-1 text-sm text-neutral-500">Latest customer orders, limited to six</p></div>
            <Link href="/sales" className="text-sm font-semibold text-neutral-700 hover:text-neutral-950">View all</Link>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4">Order</TableHead><TableHead>Customer</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="pr-4 text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {activity.sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="pl-4"><Link href={`/sales/${sale.id}`} className="font-semibold text-neutral-950 hover:underline">{sale.orderNumber}</Link><p className="text-xs text-neutral-500">{formatDate(sale.date)}</p></TableCell>
                    <TableCell>{sale.customerName}</TableCell>
                    <TableCell><StatusBadge status={sale.status} /></TableCell>
                    <TableCell className="text-right text-neutral-600 tabular-nums">{formatPKR(sale.balance)}</TableCell>
                    <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatPKR(sale.total)}</TableCell>
                  </TableRow>
                ))}
                {!activity.sales.length && <TableRow><TableCell colSpan={5} className="h-24 text-center text-neutral-500">No sales orders yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Stock watch</CardTitle><p className="mt-1 text-sm text-neutral-500">Lowest stock requiring action</p></div><WalletCards className="h-4 w-4 text-neutral-400" /></CardHeader>
          <CardContent className="space-y-4">
            {activity.lowStock.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-4 border-b pb-4 last:border-0 last:pb-0">
                <div className="min-w-0"><p className="truncate font-medium">{product.name}</p><p className="text-xs text-neutral-500">{product.sku}</p></div>
                <div className="text-right"><p className="font-semibold tabular-nums">{product.stockQuantity} {product.unit.toLowerCase()}</p><p className="text-xs text-neutral-500">{getStockStatus(product.stockQuantity, product.reorderLevel)}</p></div>
              </div>
            ))}
            {!activity.lowStock.length && <p className="py-6 text-center text-sm text-neutral-500">All products are above reorder levels.</p>}
            <Link href="/reports/current-stock?lowStock=true" className="flex items-center justify-between border-t pt-4 text-sm font-semibold text-neutral-700 hover:text-neutral-950"><span>Review low stock</span><ArrowRight className="h-4 w-4" /></Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
