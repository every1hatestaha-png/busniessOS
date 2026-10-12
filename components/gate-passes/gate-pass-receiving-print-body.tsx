import { WorkspaceIdentity, type WorkspaceIdentityDetails } from "@/components/documents/workspace-identity";

export type GatePassReceivingPrintData = {
  gatePassNumber: string;
  receivedAt: string;
  interim: boolean;
  customer: { name: string; companyName: string | null; address: string | null };
  deliveryAddress: string | null;
  reference: string | null;
  recipient: string | null;
  notes: string | null;
  items: Array<{ id: string; name: string; sent: string; accepted: string; rejected: string; awaiting: string; unit: string }>;
  totals: null | { sent: string; accepted: string; rejected: string; awaiting: string; unit: string };
};

/** Printable, price-free customer receiving document; no server mutations. */
export function GatePassReceivingPrintBody({ workspace, data }: {
  workspace: WorkspaceIdentityDetails;
  data: GatePassReceivingPrintData;
}) {
  return <article data-document data-gate-pass-print data-receiving-acknowledgement-print data-print-orientation="portrait"
    className="space-y-5 rounded-md border border-neutral-300 bg-white p-5 text-black shadow-sm sm:p-8 print:space-y-4 print:rounded-none print:border-0 print:p-0 print:shadow-none">
    <header data-document-section className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-black pb-4">
      <WorkspaceIdentity workspace={workspace} eyebrow="Customer Receiving Acknowledgement"
        nameClassName="text-lg font-bold" detailsClassName="mt-2 space-y-0.5 text-xs" />
      <div className="min-w-0 text-right text-xs">
        <p className="font-bold">GATE PASS {data.gatePassNumber}</p>
        <p className="mt-1">Received: {data.receivedAt}</p>
        <p className="mt-1 font-semibold">{data.interim ? "INTERIM RECEIVING — NOT FINAL" : "RECEIVING RECONCILED"}</p>
      </div>
    </header>
    <section data-document-section className="grid grid-cols-2 gap-4 border-b border-neutral-300 pb-3 text-xs">
      <div className="min-w-0">
        <p className="font-bold uppercase">Customer</p>
        <p className="mt-1 break-words">{data.customer.companyName || data.customer.name}</p>
        <p className="break-words">{data.deliveryAddress || data.customer.address || ""}</p>
      </div>
      <div className="min-w-0">
        <p className="font-bold uppercase">Recorded receiving</p>
        <p className="mt-1 break-all">Reference: {data.reference || "Not provided"}</p>
        <p className="break-words">Received by: {data.recipient || "Not specified"}</p>
      </div>
    </section>
    <section className="min-w-0">
      <table data-gatepass-items className="w-full table-fixed border-collapse text-left text-xs">
        <thead><tr className="border-y-2 border-black">
          <th className="w-[40%] py-2 pr-2">Product / Description</th>
          <th data-gp-thermal-hide className="w-[13%] py-2 text-right">Sent</th>
          <th className="w-[13%] py-2 text-right">Accepted</th>
          <th className="w-[13%] py-2 text-right">Rejected</th>
          <th data-gp-thermal-hide className="w-[13%] py-2 text-right">Awaiting</th>
          <th className="w-[8%] py-2 pl-1">Unit</th>
        </tr></thead>
        <tbody>{data.items.map((item) => <tr key={item.id} className="border-b border-neutral-200 align-top">
          <td className="break-words py-2 pr-2">{item.name}</td>
          <td data-gp-thermal-hide className="py-2 text-right tabular-nums">{item.sent}</td>
          <td className="py-2 text-right tabular-nums">{item.accepted}</td>
          <td className="py-2 text-right tabular-nums">{item.rejected}</td>
          <td data-gp-thermal-hide className="py-2 text-right tabular-nums">{item.awaiting}</td>
          <td className="break-words py-2 pl-1">{item.unit}</td>
        </tr>)}</tbody>
      </table>
      {data.totals &&
        <p data-document-section className="mt-2 text-right text-xs font-semibold">
          Totals: Sent {data.totals.sent} · Accepted {data.totals.accepted} ·
          Rejected {data.totals.rejected} · Awaiting {data.totals.awaiting} ({data.totals.unit})
        </p>}
      {!data.totals && <p className="mt-2 text-[10px]">
        Mixed units: physical quantities are shown per line; no misleading combined total.
      </p>}
    </section>
    {data.notes && <section data-document-section className="text-xs">
      <p className="font-semibold">Receiving notes</p>
      <p className="whitespace-pre-wrap break-words">{data.notes}</p>
    </section>}
    <section data-document-signatures className="grid grid-cols-2 gap-5 pt-12 text-center text-xs">
      <div className="border-t border-black pt-2">Customer receiving signature / stamp</div>
      <div className="border-t border-black pt-2">Recorded by / verified by</div>
    </section>
    <p className="border-t border-neutral-300 pt-2 text-center text-[10px]">
      This acknowledgement records entered customer receiving quantities only. It is not an invoice,
      proof of payment, or a certified customer signature.
    </p>
  </article>;
}
