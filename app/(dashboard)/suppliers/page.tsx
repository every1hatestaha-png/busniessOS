"use client";

import { useDeferredValue, useState } from "react";
import { Building2, Search, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEMO_SUPPLIERS } from "@/lib/demo-data";
import { formatPKR } from "@/lib/utils";

export default function SuppliersPage() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.toLowerCase().trim());
  const suppliers = DEMO_SUPPLIERS.filter((supplier) => `${supplier.name} ${supplier.companyName} ${supplier.city} ${supplier.phone}`.toLowerCase().includes(deferredQuery));
  const totalPurchases = DEMO_SUPPLIERS.reduce((sum, supplier) => sum + supplier.totalPurchases, 0);
  const payable = DEMO_SUPPLIERS.reduce((sum, supplier) => sum + supplier.currentBalance, 0);

  return <main className="space-y-6 p-4 md:p-6 lg:p-8"><PageHeader title="Suppliers" description="Manage supplier relationships and outstanding payables." />
    <section className="grid gap-3 sm:grid-cols-2"><MetricCard label="Active suppliers" value={`${DEMO_SUPPLIERS.length}`} detail="Approved supply partners" icon={Building2} /><MetricCard label="Outstanding payable" value={formatPKR(payable)} detail={`${formatPKR(totalPurchases)} lifetime purchases`} icon={WalletCards} /></section>
    <Card className="gap-0 py-0 shadow-none"><CardHeader className="gap-3 border-b py-4 sm:flex sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Supplier directory</h2><p className="text-sm text-neutral-500">{suppliers.length} suppliers shown</p></div><label className="relative sm:w-72"><Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-neutral-400" /><Input className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suppliers..." /><span className="sr-only">Search suppliers</span></label></CardHeader>
      <CardContent className="p-0"><Table><TableHeader className="bg-neutral-50/80"><TableRow><TableHead className="pl-4">Supplier</TableHead><TableHead className="hidden md:table-cell">Contact</TableHead><TableHead className="hidden lg:table-cell">City</TableHead><TableHead className="hidden text-right sm:table-cell">Total purchases</TableHead><TableHead className="text-right">Payable</TableHead><TableHead className="hidden pr-4 xl:table-cell">Status</TableHead></TableRow></TableHeader><TableBody>
        {suppliers.map((supplier) => <TableRow key={supplier.id}><TableCell className="pl-4"><p className="font-medium">{supplier.companyName}</p><p className="mt-0.5 text-xs text-neutral-500">{supplier.name}</p></TableCell><TableCell className="hidden text-neutral-600 md:table-cell">{supplier.phone}</TableCell><TableCell className="hidden text-neutral-600 lg:table-cell">{supplier.city}</TableCell><TableCell className="hidden text-right tabular-nums sm:table-cell">{formatPKR(supplier.totalPurchases)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatPKR(supplier.currentBalance)}</TableCell><TableCell className="hidden pr-4 xl:table-cell"><StatusBadge status={supplier.status} /></TableCell></TableRow>)}
        {suppliers.length === 0 && <TableRow><TableCell colSpan={6} className="h-32 text-center text-neutral-500">No suppliers match your search.</TableCell></TableRow>}
      </TableBody></Table></CardContent></Card></main>;
}
