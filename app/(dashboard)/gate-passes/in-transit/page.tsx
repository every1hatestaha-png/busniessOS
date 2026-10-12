import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/server/authorization";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { ownedTransitInventory } from "@/lib/delivery-acceptance/transit-reconciliation";
import { db } from "@/lib/server/db";

export default async function GatePassTransitInventoryPage() {
  const { workspaceId } = await requirePermission("financial.manage");
  requireOutboundGatePassDraftFeature(workspaceId);
  const rows = await db.outboundGatePass.findMany({
    where: { workspaceId, status: { in: ["IN_TRANSIT", "RECEIVING_PENDING", "ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED", "INVOICED"] } },
    include: { items: true }, orderBy: { dispatchedAt: "asc" },
  });
  const lines = rows.flatMap((gp) => gp.items.map((item) => {
    const remaining = ownedTransitInventory({
      dispatched: item.dispatchedQuantity, accepted: item.acceptedQuantity,
      rejected: item.rejectedQuantity, returned: item.returnedQuantity,
      status: gp.status, unitCost: item.unitCostSnapshot,
    });
    return { id: item.id, gpId: gp.id, gpNo: gp.gatePassNumber, product: item.productNameSnapshot, remaining };
  })).filter((line) => line.remaining.quantity.greaterThan(0));
  const total = lines.reduce((sum, line) => sum.plus(line.remaining.value), new Prisma.Decimal(0));
  return <div className="mx-auto max-w-5xl space-y-5">
    <header><Link href="/gate-passes" className="text-sm underline">All gate passes</Link>
      <h1 className="mt-2 text-2xl font-bold">Owned goods outside warehouse</h1>
      <p className="text-sm text-muted-foreground">Uninvoiced shipped goods and rejected goods not physically returned. Amounts use dispatch cost, not sales value.</p></header>
    <p className="rounded-md border p-4 text-sm font-semibold">Outstanding in-transit cost: PKR {total.toFixed(2)}</p>
    <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[600px] text-sm">
      <thead><tr><th className="p-3 text-left">Gate pass</th><th className="p-3 text-left">Product</th><th className="p-3 text-right">Quantity outside</th><th className="p-3 text-right">Value PKR</th></tr></thead>
      <tbody>{lines.map((line) => <tr key={line.id} className="border-t"><td className="p-3"><Link href={`/gate-passes/${line.gpId}`} className="underline">{line.gpNo}</Link></td><td className="p-3">{line.product}</td><td className="p-3 text-right">{line.remaining.quantity.toString()}</td><td className="p-3 text-right">{line.remaining.value.toFixed(2)}</td></tr>)}</tbody>
    </table>{!lines.length && <p className="p-4 text-sm">No outstanding gate-pass stock.</p>}</div>
  </div>;
}
