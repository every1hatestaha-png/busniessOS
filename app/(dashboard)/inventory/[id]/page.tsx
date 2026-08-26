import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleDollarSign, PackageCheck, Pencil, Tags } from "lucide-react";
import { MetricCard } from "@/components/business/metric-card";
import { StatusBadge } from "@/components/business/status-badge";
import { StockAdjustment } from "@/components/inventory/stock-adjustment";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProduct } from "@/lib/server/products";
import { calculateInventoryValue, cn, formatDate, formatPKR, getStockStatus } from "@/lib/utils";
import { requireWorkspace } from "@/lib/server/auth";
import { canPerformAction } from "@/lib/server/authorization";

export default async function ProductDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = await requireWorkspace();
  const product = await getProduct(id);
  if (!product) notFound();
  const movements = product.movements;
  const stockStatus = getStockStatus(product.stockQuantity, product.reorderLevel);

  return (
    <main className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <Link href="/inventory" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-3")}><ArrowLeft className="h-4 w-4" />Inventory</Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{product.name}</h1><StatusBadge status={stockStatus} /></div><p className="mt-1 font-mono text-sm text-neutral-500">{product.sku}</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">{canPerformAction(role, "products.write") && <Link href={`/inventory/${product.id}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil className="h-4 w-4" />Edit</Link>}{canPerformAction(role, "inventory.adjust") && <StockAdjustment productId={product.id} initialStock={product.stockQuantity} unit={product.unit.toLowerCase()} />}</div>
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="On hand" value={`${product.stockQuantity} ${product.unit.toLowerCase()}`} detail={`Reorder at ${product.reorderLevel}`} icon={PackageCheck} />
        <MetricCard label="Selling price" value={formatPKR(product.sellingPrice)} detail={`${formatPKR(product.costPrice)} cost per unit`} icon={CircleDollarSign} />
        <MetricCard label="Stock value" value={formatPKR(calculateInventoryValue(product.stockQuantity, product.costPrice))} detail="At current cost price" icon={Tags} />
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="border-b py-4"><CardTitle>Stock movement</CardTitle><p className="text-sm text-neutral-500">Recent quantity changes for this product.</p></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-neutral-50/80"><TableRow><TableHead className="pl-4">Date</TableHead><TableHead>Type</TableHead><TableHead className="hidden sm:table-cell">Reference</TableHead><TableHead className="text-right">Change</TableHead><TableHead className="pr-4 text-right">Balance</TableHead></TableRow></TableHeader>
              <TableBody>
                {movements.map((movement) => <TableRow key={movement.id}><TableCell className="pl-4 text-neutral-600">{formatDate(movement.date)}</TableCell><TableCell><StatusBadge status={movement.type} /></TableCell><TableCell className="hidden font-mono text-xs text-neutral-500 sm:table-cell">{movement.reference}</TableCell><TableCell className={`text-right font-semibold tabular-nums ${movement.quantity > 0 ? "text-emerald-700" : "text-red-600"}`}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</TableCell><TableCell className="pr-4 text-right font-medium tabular-nums">{movement.balance}</TableCell></TableRow>)}
                {movements.length === 0 && <TableRow><TableCell colSpan={5} className="h-32 text-center text-neutral-500">No stock movements recorded yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="h-fit shadow-none">
          <CardHeader><CardTitle>Product details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Description</p><p className="mt-1 leading-6 text-neutral-700">{product.description}</p></div>
            <dl className="grid grid-cols-2 gap-4 border-t pt-4"><div><dt className="text-xs text-neutral-500">Category</dt><dd className="mt-1 font-medium">{product.category}</dd></div><div><dt className="text-xs text-neutral-500">Unit</dt><dd className="mt-1 capitalize">{product.unit.toLowerCase()}</dd></div><div><dt className="text-xs text-neutral-500">Catalog status</dt><dd className="mt-1"><StatusBadge status={product.status} /></dd></div><div><dt className="text-xs text-neutral-500">Gross margin</dt><dd className="mt-1 font-medium">{Math.round(((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100)}%</dd></div></dl>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
