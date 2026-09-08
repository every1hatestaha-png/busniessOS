import { notFound } from "next/navigation";
import { DocumentFrame } from "@/components/documents/document-frame";
import { DocumentSignatures } from "@/components/documents/document-signatures";
import { PrintOnLoad } from "@/components/documents/print-on-load";
import { requireWorkspace } from "@/lib/server/auth";
import { getPurchase } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function PurchasePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requireWorkspace();
  const purchase = await getPurchase(workspaceId, id);
  if (!purchase) notFound();

  return (
    <>
      <DocumentFrame workspace={workspace} title="Purchase order" number={purchase.orderNumber} status={purchase.status === "CANCELLED" ? "CANCELLED" : undefined} details={<><p>Order date: {formatDate(purchase.date)}</p><p>Status: {purchase.status.replaceAll("_", " ")}</p>{purchase.expectedDeliveryDate && <p>Expected delivery: {formatDate(purchase.expectedDeliveryDate)}</p>}</>}>
      <section data-document-section className="my-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Supplier</p>
          <p className="mt-1 font-semibold">{purchase.supplier.companyName || purchase.supplier.name}</p>
          {purchase.supplier.phone && <p><strong>Phone:</strong> {purchase.supplier.phone}</p>}
        </div>
        <div className="text-right">
          {purchase.department && <p><strong>Department:</strong> {purchase.department}</p>}
          <p><strong>Pricing:</strong> {purchase.pricingMode === "WEIGHT" ? "Weight based" : "Per unit"}</p>
        </div>
      </section>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-neutral-100">
            <th className="border px-2 py-1 text-left">Sr</th>
            <th className="border px-2 py-1 text-left">Item Description</th>
            <th className="border px-2 py-1 text-right">{purchase.pricingMode === "WEIGHT" ? "Units" : "Qty"}</th>
            {purchase.pricingMode === "WEIGHT" && (
              <>
                <th className="border px-2 py-1 text-right">Unit Wt (kg)</th>
                <th className="border px-2 py-1 text-right">Total Wt (kg)</th>
                <th className="border px-2 py-1 text-right">Rate/kg</th>
              </>
            )}
            {purchase.pricingMode !== "WEIGHT" && <th className="border px-2 py-1 text-right">Unit cost</th>}
            <th className="border px-2 py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {purchase.items.map((item, index) => (
            <tr key={item.id} className="border-b">
              <td className="border px-2 py-1">{index + 1}</td>
              <td className="border px-2 py-1">
                {item.productName}
                {item.sku && <span className="ml-1 text-xs text-neutral-500">({item.sku})</span>}
              </td>
              <td className="border px-2 py-1 text-right">{item.quantity}{purchase.pricingMode !== "WEIGHT" && item.unit === "KG" ? " kg" : ""}</td>
              {purchase.pricingMode === "WEIGHT" && (
                <>
                  <td className="border px-2 py-1 text-right">{item.unitWeight ? `${item.unitWeight} kg` : "—"}</td>
                  <td className="border px-2 py-1 text-right">{item.totalWeight ? `${item.totalWeight} kg` : "—"}</td>
                  <td className="whitespace-nowrap border px-2 py-1 text-right">{item.perKgRate ? formatPKR(item.perKgRate) : "—"}</td>
                </>
              )}
              {purchase.pricingMode !== "WEIGHT" && <td className="whitespace-nowrap border px-2 py-1 text-right">{formatPKR(item.unitCost)}</td>}
              <td className="whitespace-nowrap border px-2 py-1 text-right font-semibold">{formatPKR(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section data-document-totals className="mb-4 flex justify-end">
        <div className="w-64 text-sm">
          <div className="flex justify-between border-t py-1"><span>Subtotal:</span><span className="whitespace-nowrap">{formatPKR(purchase.subtotal)}</span></div>
          {purchase.discount > 0 && <div className="flex justify-between py-1"><span>Discount:</span><span>- {formatPKR(purchase.discount)}</span></div>}
          <div className="flex justify-between border-t py-1 font-bold"><span>Total:</span><span className="whitespace-nowrap">{formatPKR(purchase.total)}</span></div>
        </div>
      </section>

      {purchase.notes && (
        <div className="mb-4 text-sm">
          <p><strong>Notes:</strong> {purchase.notes}</p>
        </div>
      )}

      <DocumentSignatures slots={[{ label: "Prepared by" }, { label: "Approved by" }]} />
      </DocumentFrame>
      <PrintOnLoad />
    </>
  );
}
