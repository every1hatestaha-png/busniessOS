import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/server/authorization";
import { getSupplierReturn } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function SupplierReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requirePermission("financial.manage");
  const data = await getSupplierReturn(workspaceId, id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/supplier-returns" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
          <ChevronLeft className="h-4 w-4" /> Back to Supplier Returns
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{data.number}</h1>
          <StatusBadge status={data.status} />
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Supplier: {data.supplier.name} — PO: {data.purchaseOrder.orderNumber}
          {data.goodReceivedNote && <> — GRN: {data.goodReceivedNote.grnNumber}</>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-none"><CardContent className="pt-5"><p className="text-xs text-neutral-500">Date</p><p className="mt-1 font-semibold">{formatDate(data.date)}</p></CardContent></Card>
        <Card className="shadow-none"><CardContent className="pt-5"><p className="text-xs text-neutral-500">Status</p><p className="mt-1 font-semibold">{data.status}</p></CardContent></Card>
        <Card className="shadow-none"><CardContent className="pt-5"><p className="text-xs text-neutral-500">Return total</p><p className="mt-1 font-semibold">{formatPKR(data.total)}</p></CardContent></Card>
        <Card className="shadow-none"><CardContent className="pt-5"><p className="text-xs text-neutral-500">Reason</p><p className="mt-1 font-semibold">{data.reason || "Not specified"}</p></CardContent></Card>
      </div>

      <Card className="shadow-none">
        <CardHeader><CardTitle>Returned items</CardTitle></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="pr-4 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-4 font-medium">{item.productName}<span className="ml-1 text-xs text-neutral-400">{item.sku}</span></TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatPKR(item.unitCost)}</TableCell>
                  <TableCell className="pr-4 text-right font-semibold">{formatPKR(item.totalCost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.debitNote && (
        <Card className="shadow-none">
          <CardContent className="pt-5">
            <p className="text-xs text-neutral-500">Debit note</p>
            <p className="mt-1 font-semibold">{data.debitNote.number} — {formatPKR(data.debitNote.amount)}</p>
          </CardContent>
        </Card>
      )}

      {data.notes && (
        <Card className="shadow-none">
          <CardContent className="pt-5">
            <p className="text-xs text-neutral-500">Notes</p>
            <p className="mt-1 text-sm">{data.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
