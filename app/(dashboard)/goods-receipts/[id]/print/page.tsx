import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/server/auth";
import { getGoodsReceipt } from "@/lib/server/purchases";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function GoodsReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requireWorkspace();
  const grn = await getGoodsReceipt(workspaceId, id);
  if (!grn) notFound();

  return (
    <div className="mx-auto max-w-[800px] bg-white p-8 text-black print:p-0 print:shadow-none" id="print-area">
      <div className="mb-6 border-b-2 pb-4 text-center">
        <h1 className="text-xl font-bold">{workspace.name}</h1>
        <p className="text-sm">{[workspace.address, workspace.city, workspace.country].filter(Boolean).join(", ")}</p>
        <p className="mt-2 text-lg font-bold tracking-wide">GOODS RECEIVED NOTE</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p><strong>Supplier:</strong> {grn.supplier.name}</p>
          {grn.supplier.phone && <p><strong>Phone:</strong> {grn.supplier.phone}</p>}
          <p><strong>PO Reference:</strong> {grn.purchaseOrder.orderNumber}</p>
        </div>
        <div className="text-right">
          <p><strong>GRN No:</strong> {grn.grnNumber}</p>
          <p><strong>Receipt Date:</strong> {formatDate(grn.receiptDate)}</p>
        </div>
      </div>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-neutral-100">
            <th className="border px-2 py-1 text-left">Product</th>
            <th className="border px-2 py-1 text-right">Ordered</th>
            <th className="border px-2 py-1 text-right">Prev. Accepted</th>
            <th className="border px-2 py-1 text-right">Received Now</th>
            <th className="border px-2 py-1 text-right">Accepted</th>
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
              <td className="border px-2 py-1 text-right">{item.orderedQuantity}</td>
              <td className="border px-2 py-1 text-right">{item.previouslyReceived}</td>
              <td className="border px-2 py-1 text-right">{item.receivedNow}</td>
              <td className="border px-2 py-1 text-right font-semibold">{item.acceptedQuantity}</td>
              <td className="border px-2 py-1 text-right">{item.remainingQuantity}</td>
              <td className="border px-2 py-1 text-right">{formatPKR(item.unitCost)}</td>
              <td className="border px-2 py-1 text-right font-semibold">{formatPKR(item.totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-4 flex justify-end">
        <div className="w-64 text-sm">
          <div className="flex justify-between border-t py-1 font-bold"><span>Total received value:</span><span>{formatPKR(grn.totalAmount)}</span></div>
        </div>
      </div>

      {grn.notes && (
        <div className="mb-4 text-sm">
          <p><strong>Notes:</strong> {grn.notes}</p>
        </div>
      )}

      <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p className="font-semibold">Received By</p>
          {grn.receivedBy && <p className="mt-1">{grn.receivedBy}</p>}
          <div className="mt-8 border-t" />
        </div>
        <div>
          <p className="font-semibold">Checked By</p>
          {grn.checkedBy && <p className="mt-1">{grn.checkedBy}</p>}
          <div className="mt-8 border-t" />
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: "window.onload=function(){window.print();}" }} />
    </div>
  );
}
