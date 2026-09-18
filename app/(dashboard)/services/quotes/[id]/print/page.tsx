import { notFound } from "next/navigation";

import { DocumentFrame } from "@/components/documents/document-frame";
import { DocumentSignatures } from "@/components/documents/document-signatures";
import { PrintOnLoad } from "@/components/documents/print-on-load";
import { requireWorkspace } from "@/lib/server/auth";
import { getServiceQuoteDetail } from "@/lib/server/industry-modules";
import { formatPKR } from "@/lib/utils";

export default async function ServiceQuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requireWorkspace();
  const quote = await getServiceQuoteDetail(workspaceId, id);
  if (!quote) notFound();

  return (
    <>
      <DocumentFrame
        workspace={workspace}
        title="Service quotation"
        number={quote.quoteNumber}
        status={["REJECTED","EXPIRED"].includes(quote.status) ? quote.status : undefined}
        details={<><p>Date: {formatDate(quote.createdAt)}</p><p>Status: {quote.status}</p>{quote.validUntil ? <p>Valid until: {formatDate(quote.validUntil)}</p> : null}</>}
      >
        <section data-document-section className="my-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Prepared for</p>
            <p className="mt-1 font-semibold">{quote.customerName || "Unknown client"}</p>
            {quote.customerPhone ? <p><strong>Phone:</strong> {quote.customerPhone}</p> : null}
            {quote.customerEmail ? <p><strong>Email:</strong> {quote.customerEmail}</p> : null}
            {quote.customerAddress || quote.customerCity ? <p>{[quote.customerAddress, quote.customerCity].filter(Boolean).join(", ")}</p> : null}
          </div>
          <div className="text-right">
            <p><strong>Quote status:</strong> {quote.status.replaceAll("_"," ")}</p>
            <p><strong>Line items:</strong> {quote.items.length}</p>
          </div>
        </section>

        <table className="mb-4 w-full border-collapse text-sm">
          <thead><tr className="border-y bg-neutral-100"><th className="border px-2 py-1 text-left">Sr</th><th className="border px-2 py-1 text-left">Description</th><th className="border px-2 py-1 text-right">Qty</th><th className="border px-2 py-1 text-right">Rate</th><th className="border px-2 py-1 text-right">Amount</th></tr></thead>
          <tbody>{quote.items.map((item,index)=><tr key={item.id} className="border-b"><td className="border px-2 py-1">{index+1}</td><td className="border px-2 py-1">{item.description}</td><td className="border px-2 py-1 text-right">{formatQty(item.quantity)}</td><td className="whitespace-nowrap border px-2 py-1 text-right">{formatPKR(item.unitPrice)}</td><td className="whitespace-nowrap border px-2 py-1 text-right font-semibold">{formatPKR(item.lineTotal)}</td></tr>)}</tbody>
        </table>

        <section data-document-totals className="mb-4 flex justify-end"><div className="w-64 text-sm">
          <div className="flex justify-between border-t py-1"><span>Subtotal:</span><span>{formatPKR(quote.subtotal)}</span></div>
          {quote.discount > 0 ? <div className="flex justify-between py-1"><span>Discount:</span><span>- {formatPKR(quote.discount)}</span></div> : null}
          {quote.tax > 0 ? <div className="flex justify-between py-1"><span>Tax:</span><span>{formatPKR(quote.tax)}</span></div> : null}
          <div className="flex justify-between border-t py-1 font-bold"><span>Total:</span><span>{formatPKR(quote.total)}</span></div>
        </div></section>

        {quote.notes ? <div className="mb-4 text-sm"><p><strong>Notes:</strong> {quote.notes}</p></div> : null}
        <DocumentSignatures slots={[{label:"Prepared by"},{label:"Client approval"}]} />
      </DocumentFrame>
      <PrintOnLoad />
    </>
  );
}
function formatDate(value:Date){ return new Intl.DateTimeFormat("en-PK",{dateStyle:"medium",timeZone:"Asia/Karachi"}).format(value); }
function formatQty(value:number){ return new Intl.NumberFormat("en-PK",{maximumFractionDigits:4}).format(value); }
