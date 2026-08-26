import Link from "next/link";
import { Building2, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/business/page-header";
import { MetricCard } from "@/components/business/metric-card";
import { SupplierCreateForm } from "@/components/suppliers/supplier-create-form";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { listSuppliers } from "@/lib/server/suppliers";
import { formatPKR } from "@/lib/utils";

export default async function SuppliersPage() { const { workspaceId, role } = await requireWorkspace(); const suppliers = await listSuppliers(workspaceId); const payable = suppliers.reduce((sum, row) => sum + row.currentBalance, 0); return <div className="space-y-6"><PageHeader title="Suppliers" description="Manage supplier relationships and payable khata." />
  <section className="grid gap-3 sm:grid-cols-2"><MetricCard label="Suppliers" value={String(suppliers.length)} detail="Live workspace records" icon={Building2} /><MetricCard label="Outstanding payable" value={formatPKR(payable)} detail="Cached from supplier ledger" icon={WalletCards} /></section>
  {role !== "STAFF" && <SupplierCreateForm />}
  <Card className="gap-0 py-0 shadow-none"><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Purchases</TableHead><TableHead className="text-right">Payable</TableHead></TableRow></TableHeader><TableBody>{suppliers.map((supplier) => <TableRow key={supplier.id}><TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/suppliers/${supplier.id}`}>{supplier.companyName ?? supplier.name}</Link><p className="text-xs text-neutral-500">{supplier.name}</p></TableCell><TableCell>{supplier.phone ?? supplier.email ?? "-"}</TableCell><TableCell className="text-right">{formatPKR(supplier.totalPurchases)}</TableCell><TableCell className="text-right font-semibold">{formatPKR(supplier.currentBalance)}</TableCell></TableRow>)}{!suppliers.length && <TableRow><TableCell className="h-32 text-center text-neutral-500" colSpan={4}>No suppliers yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></div>; }
