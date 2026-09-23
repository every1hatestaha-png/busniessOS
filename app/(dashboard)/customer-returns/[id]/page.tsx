import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { DocumentFrame } from "@/components/documents/document-frame";
import { DocumentSignatures } from "@/components/documents/document-signatures";
import { PrintButton } from "@/components/invoices/print-button";
import { CancelCustomerReturnButton } from "@/components/sales/cancel-customer-return-button";
import { requirePermission } from "@/lib/server/authorization";
import { getCustomerReturnDocument } from "@/lib/server/customer-return-documents";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function CustomerReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const data = await getCustomerReturnDocument(workspaceId, id);
  if (!data) notFound();

  const canCancel = data.status === "POSTED"
    && data.creditNote?.status === "OPEN"
    && data.creditNote.appliedAmount === 0;

  return (
    <div className="mx-auto max-w-[1050px] space-y-4 print:max-w-none print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/sales/${data.salesOrder.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-950">
          <ChevronLeft className="h-4 w-4" /> Sale {data.salesOrder.orderNumber} / {data.number}
        </Link>
        <div className="flex items-center gap-2">
          {canCancel && <CancelCustomerReturnButton returnId={data.id} number={data.number} />}
          <PrintButton label="Print customer return" />
        </div>
      </div>

      <DocumentFrame
        workspace={workspace}
        title="Customer return"
        number={data.number}
        status={data.status}
        statusReason={data.status === "CANCELLED" ? "Financial and inventory effects reversed. Original return retained for audit." : undefined}
        details={<><p>Date: {formatDate(data.date)}</p><p>Sale: {data.salesOrder.orderNumber}</p>{data.creditNote && <p>Credit note: {data.creditNote.number}</p>}</>}
      >
        <section data-document-section className="my-6 grid gap-6 border-b border-neutral-200 pb-6 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Returned by</p>
            <p className="mt-1 text-base font-semibold">{data.customer.displayName}</p>
            {data.customer.phone && <p className="mt-1 text-sm text-neutral-600">{data.customer.phone}</p>}
            {(data.customer.address || data.customer.city) && <p className="mt-1 text-sm text-neutral-600">{[data.customer.address, data.customer.city].filter(Boolean).join(", ")}</p>}
            {data.customer.taxId && <p className="mt-1 text-xs text-neutral-500">Tax ID: {data.customer.taxId}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Reason</p>
            <p className="mt-1 font-semibold">{data.reason || "Not specified"}</p>
            <p className="mt-2 text-xs text-neutral-500">Inventory: {data.restock ? "Returned stock restored" : "No stock restock"}</p>
          </div>
        </section>

        <section className="my-6">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-100">
                <th className="w-[46%] border px-3 py-2 text-left">Product</th>
                <th className="w-[14%] border px-3 py-2 text-right">Quantity</th>
                <th className="w-[18%] border px-3 py-2 text-right">Unit price</th>
                <th className="w-[22%] border px-3 py-2 text-right">Return value</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-normal break-words border px-3 py-2 font-medium">
                    {item.productName}
                    {item.sku && <span className="ml-1 font-mono text-xs text-neutral-500">{item.sku}</span>}
                  </td>
                  <td className="border px-3 py-2 text-right tabular-nums">{item.quantity}{item.unit ? ` ${item.unit.toLowerCase()}` : ""}</td>
                  <td className="whitespace-nowrap border px-3 py-2 text-right tabular-nums">{formatPKR(item.unitPrice)}</td>
                  <td className="whitespace-nowrap border px-3 py-2 text-right font-semibold tabular-nums">{formatPKR(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section data-document-totals className="my-6 flex justify-end">
          <div className="w-full max-w-sm space-y-2 border-y-2 border-neutral-950 py-3">
            <div className="flex justify-between text-lg font-bold"><span>Return total</span><span>{formatPKR(data.totalAmount)}</span></div>
            {data.creditNote && <>
              <div className="flex justify-between text-sm"><span>Credit note</span><span className="font-mono">{data.creditNote.number}</span></div>
              <div className="flex justify-between text-sm"><span>Credit status</span><span className="font-semibold">{data.creditNote.status.replaceAll("_", " ")}</span></div>
              <div className="flex justify-between text-sm"><span>Credit remaining</span><span>{formatPKR(data.creditNote.remainingAmount)}</span></div>
            </>}
          </div>
        </section>

        {data.notes && <section data-document-section className="my-6 text-sm"><h2 className="font-semibold">Notes</h2><p className="mt-1 whitespace-pre-wrap text-neutral-700">{data.notes}</p></section>}
        <DocumentSignatures slots={[{ label: "Prepared by" }, { label: "Customer acknowledgement" }, { label: "Approved by" }]} />
      </DocumentFrame>
    </div>
  );
}
