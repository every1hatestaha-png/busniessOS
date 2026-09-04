import Link from "next/link";
import { ArrowUpRight, Building2, CircleDollarSign, Plus, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/business/page-header";
import { MetricCard } from "@/components/business/metric-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { canPerformAction } from "@/lib/server/authorization";
import { listSuppliers } from "@/lib/server/suppliers";
import { cn, formatPKR } from "@/lib/utils";

export default async function SuppliersPage() {
  const { workspaceId, role } = await requireWorkspace();
  const suppliers = await listSuppliers(workspaceId);
  const payable = suppliers.reduce((sum, supplier) => sum + supplier.currentBalance, 0);
  const grossPoValue = suppliers.reduce((sum, supplier) => sum + supplier.totalPurchases, 0);
  const canManage = canPerformAction(role, "financial.manage");

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Suppliers" description="Supplier accounts, ordered value, and outstanding payables." action={canManage ? { label: "New supplier", href: "/suppliers/new", icon: Plus } : undefined} />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Outstanding payable" value={formatPKR(payable)} detail="Current supplier ledger liability" icon={WalletCards} />
        <MetricCard label="Gross PO value" value={formatPKR(grossPoValue)} detail="Purchase orders across all statuses" icon={CircleDollarSign} />
        <MetricCard label="Supplier accounts" value={String(suppliers.length)} detail="Live workspace records" icon={Building2} />
      </section>
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="border-b px-4 py-3"><h2 className="font-semibold">Supplier register</h2><p className="text-xs text-neutral-500">Gross PO value is ordered value, not received or posted purchasing.</p></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader className="bg-neutral-50/80"><TableRow><TableHead className="pl-4">Supplier</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Gross PO value</TableHead><TableHead className="text-right">Payable</TableHead><TableHead className="w-12"><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>{suppliers.map((supplier) => <TableRow key={supplier.id}><TableCell className="pl-4"><Link className="font-medium underline-offset-4 hover:underline" href={`/suppliers/${supplier.id}`}>{supplier.companyName ?? supplier.name}</Link><p className="text-xs text-neutral-500">{supplier.name}</p></TableCell><TableCell><p>{supplier.phone ?? "-"}</p><p className="text-xs text-neutral-500">{supplier.email ?? ""}</p></TableCell><TableCell className="text-right tabular-nums text-neutral-600">{formatPKR(supplier.totalPurchases)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatPKR(supplier.currentBalance)}</TableCell><TableCell className="pr-3 text-right"><Link href={`/suppliers/${supplier.id}`} aria-label={`View ${supplier.name}`} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "inline-flex")}><ArrowUpRight className="h-4 w-4" /></Link></TableCell></TableRow>)}{!suppliers.length && <TableRow><TableCell className="h-28 text-center text-neutral-500" colSpan={5}>No suppliers yet.</TableCell></TableRow>}</TableBody></Table></div></CardContent>
      </Card>
    </div>
  );
}
