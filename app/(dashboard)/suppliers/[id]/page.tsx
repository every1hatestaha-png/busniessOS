import Link from "next/link";
import { ArrowLeft, Building2, Pencil, WalletCards } from "lucide-react";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/business/metric-card";
import { DeleteSupplierButton } from "@/components/suppliers/delete-supplier-button";
import { SupplierPaymentForm } from "@/components/suppliers/supplier-payment-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { canPerformAction } from "@/lib/server/authorization";
import { requireWorkspace } from "@/lib/server/auth";
import { getSupplier } from "@/lib/server/suppliers";
import { cn, formatDate, formatPKR } from "@/lib/utils";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { workspaceId, role } = await requireWorkspace();
  const supplier = await getSupplier(workspaceId, (await params).id);
  if (!supplier) notFound();
  const canManage = canPerformAction(role, "financial.manage");
  const canPay = canPerformAction(role, "payments.record");
  const cashBankAccounts = canPay ? await getCashBankAccounts(workspaceId) : [];
  const displayName = supplier.companyName ?? supplier.name;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header><Link href="/suppliers" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-2")}><ArrowLeft className="h-3.5 w-3.5" />Suppliers</Link><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-neutral-500">Supplier account</p><h1 className="text-xl font-semibold tracking-tight">{displayName}</h1><p className="mt-0.5 text-xs text-neutral-500">{supplier.name}{supplier.city ? `, ${supplier.city}` : ""}</p></div><div className="flex flex-wrap gap-2">{canManage && <Link href={`/suppliers/${supplier.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil className="h-3.5 w-3.5" />Edit</Link>}{canManage && <DeleteSupplierButton supplierId={supplier.id} supplierName={displayName} />}</div></div></header>
      <section className="grid gap-3 sm:grid-cols-2"><MetricCard label="Outstanding payable" value={formatPKR(supplier.currentBalance)} detail="Current supplier ledger liability" icon={WalletCards} /><div className="rounded-md border bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-muted-foreground">Supplier contact</p><span className="flex size-7 items-center justify-center rounded border bg-muted text-muted-foreground"><Building2 className="size-3.5" /></span></div><p className="mt-3 text-sm font-semibold">{supplier.phone || supplier.email || "Not provided"}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{supplier.address || "No address recorded"}</p></div></section>
      {canPay && <SupplierPaymentForm supplierId={supplier.id} cashBankAccounts={cashBankAccounts} />}
      <Card className="gap-0 py-0 shadow-none"><CardHeader className="border-b px-4 py-3"><CardTitle>Supplier ledger</CardTitle><p className="text-xs text-neutral-500">Credit increases payable; debit reduces payable. Latest 100 entries are shown.</p></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[720px]"><TableHeader className="bg-neutral-50/80"><TableRow><TableHead className="pl-4">Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="pr-4 text-right">Credit</TableHead></TableRow></TableHeader><TableBody>{supplier.ledgerEntries.map((entry) => <TableRow key={entry.id}><TableCell className="pl-4 text-neutral-600">{formatDate(entry.date.toISOString())}</TableCell><TableCell className="font-medium">{entry.description}</TableCell><TableCell className="text-right tabular-nums">{entry.debit ? formatPKR(entry.debit) : "-"}</TableCell><TableCell className="pr-4 text-right font-semibold tabular-nums">{entry.credit ? formatPKR(entry.credit) : "-"}</TableCell></TableRow>)}{!supplier.ledgerEntries.length && <TableRow><TableCell colSpan={4} className="h-28 text-center text-neutral-500">No ledger entries.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
    </div>
  );
}
