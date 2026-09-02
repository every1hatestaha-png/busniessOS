import Link from "next/link";
import { PageHeader } from "@/components/business/page-header";
import { StatusBadge } from "@/components/business/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { listSupplierReturns } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function SupplierReturnsPage() {
  const { workspaceId } = await requireWorkspace();
  const returns = await listSupplierReturns(workspaceId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Returns"
        description="Track goods returned to suppliers and associated debit notes."
      />
      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>PO</TableHead>
                <TableHead>GRN</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    <Link className="underline-offset-4 hover:underline" href={`/supplier-returns/${row.id}`}>{row.number}</Link>
                  </TableCell>
                  <TableCell>{row.supplierName}</TableCell>
                  <TableCell className="font-mono text-xs">{row.orderNumber}</TableCell>
                  <TableCell className="font-mono text-xs">{row.grnNumber ?? "-"}</TableCell>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell className="text-right font-semibold">{formatPKR(row.total)}</TableCell>
                </TableRow>
              ))}
              {!returns.length && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-neutral-500">No supplier returns recorded.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
