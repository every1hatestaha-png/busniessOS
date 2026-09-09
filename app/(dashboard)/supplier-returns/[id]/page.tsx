import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { DocumentFrame } from "@/components/documents/document-frame";
import { DocumentSignatures } from "@/components/documents/document-signatures";
import { PrintButton } from "@/components/invoices/print-button";
import { requirePermission } from "@/lib/server/authorization";
import { getSupplierReturn } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function SupplierReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const data = await getSupplierReturn(workspaceId, id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-[1050px] space-y-4 print:max-w-none print:space-y-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/supplier-returns" className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-950">
          <ChevronLeft className="h-4 w-4" /> Supplier returns / {data.number}
        </Link>
        <PrintButton label="Print supplier return" />
      </div>

      <DocumentFrame
        workspace={workspace}
        title="Supplier return"
        number={data.number}
        status={data.status}
        details={<><p>Date: {formatDate(data.date)}</p><p>PO: {data.purchaseOrder.orderNumber}</p>{data.goodReceivedNote && <p>GRN: {data.goodReceivedNote.grnNumber}</p>}</>}
      >
        <section data-document-section className="my-6 grid gap-6 border-b border-neutral-200 pb-6 sm:grid-cols-2">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Returned to</p><p className="mt-1 text-base font-semibold">{data.supplier.name}</p></div>
          <div className="sm:text-right"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Reason</p><p className="mt-1 font-semibold">{data.reason || "Not specified"}</p></div>
        </section>

        <section className="my-6">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead><tr className="bg-neutral-100"><th className="w-1/2 border px-3 py-2 text-left">Product</th><th className="border px-3 py-2 text-right">Quantity</th><th className="border px-3 py-2 text-right">Unit cost</th><th className="border px-3 py-2 text-right">Total</th></tr></thead>
            <tbody>{data.items.map((item) => <tr key={item.id}><td className="whitespace-normal border px-3 py-2 font-medium">{item.productName}<span className="ml-1 text-xs text-neutral-500">{item.sku}</span></td><td className="border px-3 py-2 text-right">{item.quantity}</td><td className="whitespace-nowrap border px-3 py-2 text-right">{formatPKR(item.unitCost)}</td><td className="whitespace-nowrap border px-3 py-2 text-right font-semibold">{formatPKR(item.totalCost)}</td></tr>)}</tbody>
          </table>
        </section>

        <section data-document-totals className="my-6 flex justify-end"><div className="flex w-full max-w-sm justify-between border-y-2 border-neutral-950 py-3 text-lg font-bold"><span>Return total</span><span>{formatPKR(data.total)}</span></div></section>
        {data.debitNote && <section data-document-section className="my-6 text-sm"><p className="font-semibold">Debit note: {data.debitNote.number}</p><p>{formatPKR(data.debitNote.amount)}</p></section>}
        {data.notes && <section data-document-section className="my-6 text-sm"><h2 className="font-semibold">Notes</h2><p className="mt-1 whitespace-pre-wrap text-neutral-700">{data.notes}</p></section>}
        <DocumentSignatures slots={[{ label: "Prepared by" }, { label: "Checked by" }, { label: "Approved by" }]} />
      </DocumentFrame>
    </div>
  );
}
