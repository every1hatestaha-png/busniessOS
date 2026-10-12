import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/invoices/print-button";
import { requirePermission } from "@/lib/server/authorization";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { getOutboundGatePass } from "@/lib/server/outbound-gate-passes";

export default async function OutboundGatePassPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requirePermission("business.read");
  requireOutboundGatePassDraftFeature(workspaceId);
  const gp = await getOutboundGatePass(workspaceId, id);
  if (!gp || gp.status === "DRAFT" || gp.status === "CANCELLED") notFound();
  return <main className="mx-auto max-w-4xl space-y-5 bg-white p-8 text-black print:max-w-none print:p-0">
    <div className="flex justify-between print:hidden">
      <Link href={`/gate-passes/${id}`}>Back to gate pass</Link><PrintButton label="Print Gate Pass" />
    </div>
    <header className="flex justify-between border-b-2 border-black pb-4">
      <div><h1 className="text-xl font-bold">{workspace.name}</h1><p className="text-sm">{workspace.address}</p><p className="text-xs">Delivery Challan / Gate Pass</p></div>
      <div className="text-right"><p className="font-mono text-lg font-bold">{gp.gatePassNumber}</p><p className="text-sm">{gp.gatePassDate.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}</p></div>
    </header>
    <section className="grid grid-cols-2 gap-5 border-b py-4 text-sm">
      <div><p className="font-semibold">Recipient</p><p>{gp.customer.companyName || gp.customer.name}</p><p>{gp.deliveryAddress || gp.customer.address}</p></div>
      <div><p className="font-semibold">Dispatch reference</p><p>{gp.gatePassNumber}</p><p>Status: {gp.status.replaceAll("_", " ")}</p></div>
    </section>
    <table className="w-full border-collapse text-sm"><thead><tr className="border-b-2 border-black"><th className="py-3 text-left">#</th><th className="text-left">Product</th><th className="text-left">SKU</th><th className="text-right">Quantity</th><th className="text-left">Unit</th></tr></thead>
      <tbody>{gp.items.map((item, index) => <tr key={item.id} className="border-b"><td className="py-3">{index+1}</td><td>{item.productNameSnapshot}</td><td>{item.productSkuSnapshot}</td><td className="text-right">{item.dispatchedQuantity.toString()}</td><td>{item.productUnitSnapshot}</td></tr>)}</tbody>
    </table>
    {gp.notes && <p className="py-3 text-sm">Notes: {gp.notes}</p>}
    <footer className="mt-20 grid grid-cols-3 gap-8 text-center text-sm"><div className="border-t pt-2">Prepared by</div><div className="border-t pt-2">Authorized by</div><div className="border-t pt-2">Receiver signature</div></footer>
    <p className="pt-6 text-center text-xs">Physical dispatch document only. Not a tax or commercial invoice.</p>
  </main>;
}
