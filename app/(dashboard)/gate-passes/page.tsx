import Link from "next/link";

import { canPerformAction, requirePermission } from "@/lib/server/authorization";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { listOutboundGatePasses } from "@/lib/server/outbound-gate-passes";

export default async function GatePassesPage() {
  const { workspaceId, role } = await requirePermission("business.read");
  requireOutboundGatePassDraftFeature(workspaceId);
  const rows = await listOutboundGatePasses(workspaceId);
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Outbound Gate Passes</h1><p className="text-sm text-muted-foreground">Independent delivery paperwork, receiving and accepted-quantity invoicing.</p></div>
      {canPerformAction(role, "sales.create") && <Link className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white" href="/gate-passes/new">New gate pass draft</Link>}
    </header>
    {canPerformAction(role, "financial.manage") && <Link href="/gate-passes/pending-invoices" className="inline-flex rounded-md border px-3 py-2 text-sm font-medium">Pending Invoices</Link>}
    {canPerformAction(role, "financial.manage") && <Link href="/gate-passes/in-transit" className="ml-2 inline-flex rounded-md border px-3 py-2 text-sm font-medium">In-Transit Stock</Link>}
    <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Dispatch requires recorded invoice-timing authorization. For future V2 Gate Passes, available stock is deducted once at ISSUE and is not deducted again at DISPATCH. Older Gate Passes retain the legacy dispatch-time stock rule. Record signed customer receiving before preparing accepted-only credit invoices. Existing records are not changed by a V2 cutover.</p>
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-muted/40"><tr><th className="p-3">Gate pass</th><th className="p-3">Customer</th><th className="p-3">Date</th><th className="p-3">Items</th><th className="p-3">Status</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className="border-t">
          <td className="p-3 font-mono"><Link href={"/gate-passes/" + row.id} className="font-semibold underline underline-offset-4">{row.gatePassNumber}</Link></td>
          <td className="p-3">{row.customer.companyName || row.customer.name}</td>
          <td className="p-3">{row.gatePassDate.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}</td>
          <td className="p-3">{row._count.items}</td><td className="p-3">{row.status}</td>
        </tr>)}</tbody>
      </table>
      {rows.length === 0 && <p className="p-5 text-sm text-muted-foreground">No gate pass drafts have been created yet.</p>}
    </div>
    <Link href="/sales" className="text-sm underline underline-offset-4">Back to Sales</Link>
  </div>;
}
