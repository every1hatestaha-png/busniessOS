import { WorkspaceIdentity, type WorkspaceIdentityDetails } from "@/components/documents/workspace-identity";

/** Pure printable document shared by the authenticated page and synthetic Chromium printer certification. */
export type GatePassPrintableData = {
  gatePassNumber: string;
  status: string;
  customer: { name: string; companyName: string | null; address: string | null; phone: string | null };
  deliveryAddress: string | null;
  notes: string | null;
  items: Array<{
    id: string;
    productNameSnapshot: string;
    productSkuSnapshot: string | null;
    dispatchedQuantity: string;
    productUnitSnapshot: string;
  }>;
};

export function GatePassPrintBody({ workspace, gp, date, recipient, totalQuantity, totalUnit, isSingleUnit }: {
  workspace: WorkspaceIdentityDetails;
  gp: GatePassPrintableData;
  date: string;
  recipient: string;
  totalQuantity: string;
  totalUnit: string;
  isSingleUnit: boolean;
}) {
  return (
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
            <td className="py-2 text-right tabular-nums">{item.dispatchedQuantity}</td>
            <td className="break-words py-2 pl-2">{item.productUnitSnapshot}</td>
          </tr>)}</tbody>
          <tfoot>
            <tr data-gp-a4-totals className="border-t-2 border-black font-semibold">
              <td colSpan={3} className="py-2 text-right" data-gp-total-label>Total quantity ({gp.items.length} lines)</td>
              <td className="py-2 text-right tabular-nums">{totalQuantity}</td>
              <td className="pl-2 text-xs">{totalUnit}</td>
            </tr>
            <tr data-gp-thermal-totals className="hidden border-t-2 border-black font-semibold">
              <td colSpan={2} className="py-2 text-right" data-gp-total-label>Total ({gp.items.length} lines)</td>
              <td className="py-2 text-right tabular-nums">{totalQuantity}</td>
              <td className="pl-1 text-xs">{totalUnit}</td>
            </tr>
          </tfoot>
        </table>
        {!isSingleUnit && <p className="mt-1 text-[10px] text-neutral-600">Multiple product units are present; no misleading combined quantity is printed.</p>}
      </section>

      {gp.notes && <section data-document-section className="text-xs"><p className="font-semibold">Remarks</p><p className="whitespace-pre-wrap break-words">{gp.notes}</p></section>}

      <section data-document-signatures className="pt-8 text-xs">
        <div className="grid grid-cols-3 gap-5 text-center">
          <div className="border-t border-black pt-2">Prepared By</div>
          <div className="border-t border-black pt-2">Authorized By</div>
          <div className="border-t border-black pt-2">Receiver signature / stamp</div>
        </div>
        <p className="mt-5">Receiving date: ____________________ &nbsp; Receiving reference: ____________________</p>
      </section>
      <p className="border-t border-neutral-300 pt-2 text-center text-[10px]">This is a delivery / gate pass only. No commercial or tax invoice is generated by printing.</p>
    </article>
  );
}
