import { notFound } from "next/navigation";
import { DocumentFrame } from "@/components/documents/document-frame";
import { DocumentSignatures } from "@/components/documents/document-signatures";
import { PrintOnLoad } from "@/components/documents/print-on-load";
import { requireWorkspace } from "@/lib/server/auth";
import { getGoodsReceipt } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function GoodsReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requireWorkspace();
  const grn = await getGoodsReceipt(workspaceId, id);
  if (!grn) notFound();
  const hasWeightedItems = grn.items.some((item) => item.perKgRate != null);

  return (
    <>
      <DocumentFrame workspace={workspace} title="Goods received note" number={grn.grnNumber} status={grn.status === "VOIDED" ? "VOIDED" : undefined} statusReason={grn.voidedReason} details={<><p>Receipt date: {formatDate(grn.receiptDate)}</p><p>PO reference: {grn.purchaseOrder.orderNumber}</p><p>Status: {grn.status}</p></>}>
      <section data-document-section className="my-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Supplier</p>
          <p className="mt-1 font-semibold">{grn.supplier.name}</p>
          {grn.supplier.phone && <p><strong>Phone:</strong> {grn.supplier.phone}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Receipt control</p>
          <p className="mt-1">Received by: {grn.receivedBy || "Not specified"}</p>
          <p>Checked by: {grn.checkedBy || "Not specified"}</p>
        </div>
      </section>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-neutral-100">
            <th className="border px-2 py-1 text-left">Product</th>
            <th className="border px-2 py-1 text-right">{hasWeightedItems ? "Units ordered" : "Ordered"}</th>
            <th className="border px-2 py-1 text-right">Prev. accepted</th>
            <th className="border px-2 py-1 text-right">Units received</th>
            <th className="border px-2 py-1 text-right">Units accepted</th>
            {hasWeightedItems && <><th className="border px-2 py-1 text-right">Received wt.</th><th className="border px-2 py-1 text-right">Accepted wt.</th></>}
            <th className="border px-2 py-1 text-right">Remaining</th>
            <th className="border px-2 py-1 text-right">Rate</th>
            <th className="border px-2 py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {grn.items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="border px-2 py-1">
                {item.productName}
                {item.sku && <span className="ml-1 text-xs text-neutral-500">({item.sku})</span>}
              </td>
              <td className="border px-2 py-1 text-right">{item.orderedQuantity} {item.unit.toLowerCase()}</td>
              <td className="border px-2 py-1 text-right">{item.previouslyReceived} {item.unit.toLowerCase()}</td>
              <td className="border px-2 py-1 text-right">{item.receivedNow} {item.unit.toLowerCase()}</td>
              <td className="border px-2 py-1 text-right font-semibold">{item.acceptedQuantity} {item.unit.toLowerCase()}</td>
              {hasWeightedItems && <><td className="border px-2 py-1 text-right">{item.receivedWeightKg != null ? `${item.receivedWeightKg} kg` : "-"}</td><td className="border px-2 py-1 text-right">{item.acceptedWeightKg != null ? `${item.acceptedWeightKg} kg` : "-"}</td></>}
              <td className="border px-2 py-1 text-right">{item.remainingQuantity} {item.unit === "KG" ? "kg" : ""}</td>
              <td className="whitespace-nowrap border px-2 py-1 text-right">{item.perKgRate != null ? (item.ratePerKg != null ? `${formatPKR(item.ratePerKg)}/kg` : "Missing rate/kg") : `${formatPKR(item.unitCost)}/${item.unit.toLowerCase()}`}</td>
              <td className="whitespace-nowrap border px-2 py-1 text-right font-semibold">{formatPKR(item.totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section data-document-totals className="mb-4 flex justify-end">
        <div className="w-64 text-sm">
          <div className="mb-1 hidden text-[9px] uppercase tracking-wide text-neutral-500 print:block">GRN {grn.grnNumber}</div><div className="flex justify-between border-t py-1 font-bold"><span>Total received value:</span><span className="whitespace-nowrap">{formatPKR(grn.totalAmount)}</span></div>
        </div>
      </section>

      {grn.notes && (
        <div className="mb-4 text-sm">
          <p><strong>Notes:</strong> {grn.notes}</p>
        </div>
      )}

      <DocumentSignatures slots={[{ label: "Received by", name: grn.receivedBy }, { label: "Checked by", name: grn.checkedBy }]} />
      </DocumentFrame>
      <PrintOnLoad />
    </>
  );
}
