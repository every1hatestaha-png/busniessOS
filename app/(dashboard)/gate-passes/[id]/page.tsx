import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/server/authorization";
import { getOutboundGatePass } from "@/lib/server/outbound-gate-passes";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";

export default async function OutboundGatePassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requirePermission("business.read");
  requireOutboundGatePassDraftFeature(workspaceId);
  const gatePass = await getOutboundGatePass(workspaceId, id);
  if (!gatePass) notFound();

  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link href="/gate-passes" className="text-sm underline underline-offset-4">All Gate Passes</Link>
        <h1 className="mt-2 font-mono text-2xl font-bold">{gatePass.gatePassNumber}</h1>
        <p className="text-sm text-muted-foreground">{gatePass.status} · {gatePass.gatePassDate.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}</p>
      </div>
      <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Draft only, not valid for dispatch</span>
    </div>
    <div className="rounded-md border p-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
      <p className="font-semibold">{gatePass.customer.companyName || gatePass.customer.name}</p>
      <p className="text-sm">{gatePass.deliveryAddress || gatePass.customer.address || "No delivery address supplied"}</p>
      {gatePass.customer.phone && <p className="text-sm">{gatePass.customer.phone}</p>}
    </div>
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[550px] text-left text-sm">
        <thead className="bg-muted/40"><tr><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3 text-right">Quantity</th><th className="p-3">Unit</th></tr></thead>
        <tbody>{gatePass.items.map((item) => <tr key={item.id} className="border-t">
          <td className="p-3">{item.productNameSnapshot}</td>
          <td className="p-3 font-mono">{item.productSkuSnapshot || "-"}</td>
          <td className="p-3 text-right tabular-nums">{item.dispatchedQuantity.toString()}</td>
          <td className="p-3">{item.productUnitSnapshot}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {gatePass.notes && <p className="text-sm"><span className="font-semibold">Notes: </span>{gatePass.notes}</p>}
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      Printing, issuing, dispatch, receiving and pending invoice creation are disabled until stock and finance reconciliation is verified.
      No sale, receivable or inventory movement has been posted.
    </div>
  </div>;
}
