import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/server/auth";
import { getPurchase } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function PurchasePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requireWorkspace();
  const purchase = await getPurchase(workspaceId, id);
  if (!purchase) notFound();

  return (
    <div className="mx-auto max-w-[800px] bg-white p-8 text-black print:p-0 print:shadow-none" id="print-area">
      <div className="mb-6 border-b-2 pb-4 text-center">
        <h1 className="text-xl font-bold">{workspace.name}</h1>
        <p className="text-sm">{[workspace.address, workspace.city, workspace.country].filter(Boolean).join(", ")}</p>
        <p className="mt-2 text-lg font-bold tracking-wide">PURCHASE ORDER</p>
      </div>
      {purchase.status === "CANCELLED" && <div className="mb-4 border-y-4 border-black p-2 text-center text-xl font-black tracking-[0.25em]">CANCELLED</div>}

      <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p><strong>Supplier:</strong> {purchase.supplier.companyName || purchase.supplier.name}</p>
          {purchase.supplier.phone && <p><strong>Phone:</strong> {purchase.supplier.phone}</p>}
        </div>
        <div className="text-right">
          <p><strong>PO No:</strong> {purchase.orderNumber}</p>
          <p><strong>Date:</strong> {formatDate(purchase.date)}</p>
          {purchase.expectedDeliveryDate && <p><strong>Delivery:</strong> {formatDate(purchase.expectedDeliveryDate)}</p>}
          {purchase.department && <p><strong>Department:</strong> {purchase.department}</p>}
        </div>
      </div>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-neutral-100">
            <th className="border px-2 py-1 text-left">Sr</th>
            <th className="border px-2 py-1 text-left">Item Description</th>
            <th className="border px-2 py-1 text-right">Qty</th>
            {purchase.pricingMode === "WEIGHT" && (
              <>
                <th className="border px-2 py-1 text-right">Unit Wt</th>
                <th className="border px-2 py-1 text-right">Total Wt</th>
                <th className="border px-2 py-1 text-right">Rate/kg</th>
              </>
            )}
            <th className="border px-2 py-1 text-right">Pricing</th>
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
              <td className="border px-2 py-1 text-right">{item.quantity}</td>
              {purchase.pricingMode === "WEIGHT" && (
                <>
                  <td className="border px-2 py-1 text-right">{item.unitWeight ? `${item.unitWeight} kg` : "—"}</td>
                  <td className="border px-2 py-1 text-right">{item.totalWeight ? `${item.totalWeight} kg` : "—"}</td>
                  <td className="border px-2 py-1 text-right">{item.perKgRate ? formatPKR(item.perKgRate) : "—"}</td>
                </>
              )}
              <td className="border px-2 py-1 text-right">{formatPKR(item.unitCost)}</td>
              <td className="border px-2 py-1 text-right font-semibold">{formatPKR(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-4 flex justify-end">
        <div className="w-64 text-sm">
          <div className="flex justify-between border-t py-1"><span>Subtotal:</span><span>{formatPKR(purchase.subtotal)}</span></div>
          {purchase.discount > 0 && <div className="flex justify-between py-1"><span>Discount:</span><span>- {formatPKR(purchase.discount)}</span></div>}
          <div className="flex justify-between border-t py-1 font-bold"><span>Total:</span><span>{formatPKR(purchase.total)}</span></div>
        </div>
      </div>

      {purchase.notes && (
        <div className="mb-4 text-sm">
          <p><strong>Notes:</strong> {purchase.notes}</p>
        </div>
      )}

      <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p className="font-semibold">Prepared By</p>
          <div className="mt-8 border-t" />
        </div>
        <div>
          <p className="font-semibold">Approved By</p>
          <div className="mt-8 border-t" />
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: "window.onload=function(){window.print();}" }} />
    </div>
  );
}
