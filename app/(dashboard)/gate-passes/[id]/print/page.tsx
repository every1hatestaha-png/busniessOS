import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceIdentity } from "@/components/documents/workspace-identity";
import { PrintButton } from "@/components/invoices/print-button";
import { requirePermission } from "@/lib/server/authorization";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { getOutboundGatePass } from "@/lib/server/outbound-gate-passes";

/**
 * Print-only physical movement document. Never derive it from an invoice,
 * expose pricing or produce accounting entries as a side effect of printing.
 */
export default async function OutboundGatePassPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requirePermission("business.read");
  requireOutboundGatePassDraftFeature(workspaceId);
  const gp = await getOutboundGatePass(workspaceId, id);
  if (!gp || gp.status === "DRAFT" || gp.status === "CANCELLED") notFound();

  const date = gp.gatePassDate.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" });
  const totalQuantity = gp.items.reduce((sum, item) => sum.plus(item.dispatchedQuantity), gp.items[0]!.dispatchedQuantity.mul(0));
  const recipient = gp.customer.companyName || gp.customer.name;

  return <main className="mx-auto max-w-4xl space-y-4 px-3 py-5 text-black sm:px-6 print:m-0 print:max-w-none print:space-y-0 print:p-0">
    <nav aria-label="Gate pass print actions" className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={`/gate-passes/${id}`} className="text-sm font-semibold underline underline-offset-4">Back to Gate Pass</Link>
      <div className="flex flex-wrap gap-2">
        <PrintButton label="Print A4 Gate Pass" />
        <PrintButton label="Print 80mm Copy" format="thermal" />
      </div>
    </nav>

    <article data-document data-gate-pass-print data-print-orientation="portrait"
      className="space-y-5 rounded-md border border-neutral-300 bg-white p-5 text-black shadow-sm sm:p-8 print:space-y-4 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header data-document-section className="flex flex-wrap items-start justify-between gap-5 border-b-2 border-black pb-4">
        <WorkspaceIdentity workspace={workspace} eyebrow="Delivery Challan / Gate Pass"
          nameClassName="text-lg font-bold" detailsClassName="mt-2 space-y-0.5 text-xs text-neutral-700" />
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide">Gate Pass No.</p>
          <p className="break-all font-mono text-lg font-bold">{gp.gatePassNumber}</p>
          <p className="mt-1 text-xs">Dated: {date}</p>
        </div>
      </header>

      <section data-document-section className="grid grid-cols-2 gap-5 border-b border-neutral-300 pb-4 text-xs">
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-wide">Deliver To</p>
          <p className="mt-1 break-words font-semibold">{recipient}</p>
          {gp.customer.companyName && gp.customer.name !== gp.customer.companyName && <p>{gp.customer.name}</p>}
          {gp.deliveryAddress || gp.customer.address ? <p className="break-words">{gp.deliveryAddress || gp.customer.address}</p> : null}
          {gp.customer.phone && <p>{gp.customer.phone}</p>}
        </div>
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-wide">Dispatch Reference</p>
          <p className="mt-1 break-all font-mono">{gp.gatePassNumber}</p>
          <p>Document date: {date}</p>
          <p>Status: {gp.status.replaceAll("_", " ")}</p>
        </div>
      </section>

      <section className="min-w-0">
        <table data-gatepass-items className="w-full table-fixed border-collapse text-left text-xs">
          <thead><tr className="border-y-2 border-black">
            <th className="w-[7%] py-2 pr-2">#</th>
            <th className="w-[43%] py-2 pr-2">Product / Description</th>
            <th data-gp-sku className="w-[22%] py-2 pr-2">SKU</th>
            <th className="w-[15%] py-2 text-right">Quantity</th>
            <th className="w-[13%] py-2 pl-2">Unit</th>
          </tr></thead>
          <tbody>{gp.items.map((item, index) => <tr key={item.id} className="border-b border-neutral-200 align-top">
            <td className="py-2 pr-2">{index + 1}</td>
            <td className="break-words py-2 pr-2">{item.productNameSnapshot}</td>
            <td data-gp-sku className="break-all py-2 pr-2">{item.productSkuSnapshot || "—"}</td>
            <td className="py-2 text-right tabular-nums">{item.dispatchedQuantity.toString()}</td>
            <td className="break-words py-2 pl-2">{item.productUnitSnapshot}</td>
          </tr>)}</tbody>
          <tfoot><tr className="border-t-2 border-black font-semibold">
            <td colSpan={3} className="py-2 text-right" data-gp-total-label>Total quantity ({gp.items.length} lines)</td>
            <td className="py-2 text-right tabular-nums">{totalQuantity.toString()}</td>
            <td />
          </tr></tfoot>
        </table>
        <p className="mt-1 text-[10px] text-neutral-600">Quantities are physical units as specified on each line; mixed units must not be interpreted as one unit type.</p>
      </section>

      {gp.notes && <section data-document-section className="text-xs"><p className="font-semibold">Remarks</p><p className="whitespace-pre-wrap break-words">{gp.notes}</p></section>}

      <section data-document-signatures className="pt-8 text-xs">
        <div className="grid grid-cols-3 gap-5 text-center">
          <div className="border-t border-black pt-2">Prepared By</div>
          <div className="border-t border-black pt-2">Authorized By</div>
          <div className="border-t border-black pt-2">Receiver Signature / Stamp</div>
        </div>
        <p className="mt-5">Receiving date: ____________________ &nbsp; Receiving reference: ____________________</p>
      </section>
      <p className="border-t border-neutral-300 pt-2 text-center text-[10px]">This is a delivery / gate pass only. No commercial or tax invoice is generated by printing.</p>
    </article>
  </main>;
}
