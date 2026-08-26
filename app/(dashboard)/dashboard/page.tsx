import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CircleDollarSign,
  ShoppingBag,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/business/metric-card";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEMO_CUSTOMERS, DEMO_PRODUCTS, DEMO_SALES } from "@/lib/demo-data";
import { formatDate, formatPKR, getStockStatus } from "@/lib/utils";

export default function DashboardPage() {
  const activeSales = DEMO_SALES.filter((sale) => sale.status !== "CANCELLED");
  const todaySales = activeSales.filter((sale) => sale.date === "2026-08-26");
  const monthRevenue = activeSales.reduce((sum, sale) => sum + sale.total, 0);
  const receivables = activeSales.reduce((sum, sale) => sum + sale.balanceAmount, 0);
  const inventoryValue = DEMO_PRODUCTS.reduce((sum, product) => sum + product.stockQuantity * product.costPrice, 0);
  const lowStock = DEMO_PRODUCTS.filter((product) => product.stockQuantity <= product.reorderLevel);
  const collected = activeSales.reduce((sum, sale) => sum + sale.paidAmount, 0);
  const collectionRate = Math.round((collected / monthRevenue) * 100);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <section className="overflow-hidden rounded-2xl bg-neutral-950 px-5 py-6 text-white md:px-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Wednesday, 26 August</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">Good afternoon, Hassan</h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-400">Here is the latest pulse of Hassan Auto Parts.</p>
          </div>
          <Link href="/sales/new" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200">
            New sales order <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Today’s sales" value={formatPKR(todaySales.reduce((sum, sale) => sum + sale.total, 0))} detail={`${todaySales.length} order ready to track`} icon={ShoppingBag} />
        <MetricCard label="August revenue" value={formatPKR(monthRevenue)} detail={`${activeSales.length} active sales orders`} icon={CircleDollarSign} />
        <MetricCard label="Receivables" value={formatPKR(receivables)} detail={`Across ${DEMO_CUSTOMERS.filter((customer) => customer.currentBalance > 0).length} customer accounts`} icon={Banknote} />
        <MetricCard label="Inventory at cost" value={formatPKR(inventoryValue)} detail={`${lowStock.length} products need attention`} icon={Boxes} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent sales</CardTitle>
              <p className="mt-1 text-sm text-neutral-500">Newest customer orders and payment positions</p>
            </div>
            <Link href="/sales" className="text-sm font-semibold text-neutral-700 hover:text-neutral-950">View all</Link>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4">Order</TableHead><TableHead>Customer</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="pr-4 text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {DEMO_SALES.slice(0, 5).map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="pl-4"><Link href={`/sales/${sale.id}`} className="font-semibold text-neutral-950 hover:underline">{sale.orderNumber}</Link><p className="text-xs text-neutral-500">{formatDate(sale.date)}</p></TableCell>
                    <TableCell>{sale.customerName}</TableCell>
                    <TableCell><StatusBadge status={sale.status} /></TableCell>
                    <TableCell className="text-right text-neutral-600">{formatPKR(sale.balanceAmount)}</TableCell>
                    <TableCell className="pr-4 text-right font-semibold">{formatPKR(sale.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card className="shadow-none">
            <CardHeader><CardTitle>Collection health</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-end justify-between"><span className="text-3xl font-bold tracking-tight">{collectionRate}%</span><span className="text-xs font-medium text-neutral-500">of sales collected</span></div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${collectionRate}%` }} /></div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm"><div><p className="text-neutral-500">Collected</p><p className="mt-1 font-semibold">{formatPKR(collected)}</p></div><div><p className="text-neutral-500">Outstanding</p><p className="mt-1 font-semibold">{formatPKR(receivables)}</p></div></div>
          </CardContent>
        </Card>

          <Card className="shadow-none">
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Stock watch</CardTitle><AlertTriangle className="h-4 w-4 text-amber-500" /></CardHeader>
            <CardContent className="space-y-4">
              {lowStock.slice(0, 4).map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-4">
                  <div className="min-w-0"><p className="truncate font-medium">{product.name}</p><p className="text-xs text-neutral-500">{product.sku}</p></div>
                  <div className="text-right"><p className="font-semibold">{product.stockQuantity} {product.unit.toLowerCase()}</p><p className="text-xs text-neutral-500">{getStockStatus(product.stockQuantity, product.reorderLevel)}</p></div>
                </div>
              ))}
              <Link href="/inventory" className="flex items-center justify-between border-t pt-4 text-sm font-semibold text-neutral-700 hover:text-neutral-950"><span>Review inventory</span><ArrowRight className="h-4 w-4" /></Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm" className="shadow-none"><CardContent className="flex items-center gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Users className="h-4 w-4" /></span><div><p className="font-semibold">{DEMO_CUSTOMERS.length} customer accounts</p><p className="text-xs text-neutral-500">All active and ready to trade</p></div></CardContent></Card>
        <Card size="sm" className="shadow-none"><CardContent className="flex items-center gap-3"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><ShoppingBag className="h-4 w-4" /></span><div><p className="font-semibold">{activeSales.filter((sale) => sale.balanceAmount === 0).length} fully settled orders</p><p className="text-xs text-neutral-500">No amount due</p></div></CardContent></Card>
        <Card size="sm" className="shadow-none"><CardContent className="flex items-center gap-3"><span className="rounded-lg bg-amber-50 p-2 text-amber-700"><Boxes className="h-4 w-4" /></span><div><p className="font-semibold">{DEMO_PRODUCTS.length} tracked products</p><p className="text-xs text-neutral-500">Across {new Set(DEMO_PRODUCTS.map((product) => product.category)).size} categories</p></div></CardContent></Card>
      </div>
    </div>
  );
}
