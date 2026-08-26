import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/business/page-header";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { listPurchases } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";
export default async function PurchasesPage() { const { workspaceId, role } = await requireWorkspace(); const purchases = await listPurchases(workspaceId); return <div className="space-y-6"><PageHeader title="Purchases" description="Receive stock and track supplier payables atomically." action={role !== "STAFF" ? { label: "New purchase", href: "/purchases/new", icon: Plus } : undefined} /><Card className="gap-0 py-0 shadow-none"><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader><TableBody>{purchases.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs"><Link className="underline-offset-4 hover:underline" href={`/purchases/${row.id}`}>{row.orderNumber}</Link></TableCell><TableCell>{row.supplierName}</TableCell><TableCell>{formatDate(row.date)}</TableCell><TableCell><StatusBadge status={row.status} /></TableCell><TableCell className="text-right">{formatPKR(row.total)}</TableCell><TableCell className="text-right font-semibold">{formatPKR(row.balance)}</TableCell></TableRow>)}{!purchases.length && <TableRow><TableCell colSpan={6} className="h-32 text-center text-neutral-500">No purchases yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></div>; }
