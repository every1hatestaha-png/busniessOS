import Link from "next/link";
import { requirePermission } from "@/lib/server/authorization";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { db } from "@/lib/server/db";

export default async function PendingAcceptedInvoicesPage() {
  const { workspaceId } = await requirePermission("financial.manage");
  requireOutboundGatePassDraftFeature(workspaceId);
  const rows = await db.outboundGatePass.findMany({
    where: { workspaceId, status: { in: ["ISSUED", "IN_TRANSIT", "RECEIVING_PENDING", "ACCEPTED", "PARTIALLY_ACCEPTED"] } },
    orderBy: { issuedAt: "asc" },
    include: { customer: { select: { name: true, companyName: true } }, items: true },
  });
  return <div className="mx-auto max-w-5xl space-y-5">
    <header><Link href="/gate-passes" className="text-sm underline">All gate passes</Link>
      <h1 className="mt-2 text-2xl font-bold">Pending Invoices</h1>
      <p className="text-sm text-muted-foreground">Issued gate passes stay visible while customer receiving is pending. Invoicing is available only after receiving is reconciled, subject to compliance checks.</p></header>
    <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[650px] text-sm">
      <thead><tr className="bg-muted/50"><th className="p-3 text-left">Gate pass</th><th className="p-3 text-left">Customer</th><th className="p-3">Accepted lines</th><th className="p-3">Rejected lines</th><th className="p-3">Receiving</th><th className="p-3">Action</th></tr></thead>
      <tbody>{rows.map((row) => { const confirmed = row.status === "ACCEPTED" || row.status === "PARTIALLY_ACCEPTED"; return <tr className="border-t" key={row.id}><td className="p-3 font-mono">{row.gatePassNumber}</td><td className="p-3">{row.customer.companyName || row.customer.name}</td>
        <td className="p-3 text-center">{row.items.filter((x) => x.acceptedQuantity.greaterThan(0)).length}</td>
        <td className="p-3 text-center">{row.items.filter((x) => x.rejectedQuantity.greaterThan(0)).length}</td>
        <td className="p-3">{confirmed ? "Receiving confirmed" : "Awaiting receiving"}</td>
        <td className="p-3"><Link href={`/gate-passes/${row.id}`} className="underline">{confirmed ? "Review and invoice" : "Review gate pass"}</Link></td></tr>; })}</tbody>
    </table>{!rows.length && <p className="p-4 text-sm text-muted-foreground">No accepted gate passes await invoicing.</p>}</div>
  </div>;
}
