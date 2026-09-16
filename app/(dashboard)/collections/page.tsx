import { AlertTriangle, CircleDollarSign, MessageCircle, PhoneOff } from "lucide-react";

import { SmartCollectionsTable } from "@/components/collections/smart-collections-table";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/server/authorization";
import { getSmartCollections } from "@/lib/server/smart-collections";
import { formatPKR } from "@/lib/utils";

function SummaryCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof CircleDollarSign }) {
  return (
    <Card className="gap-0 rounded-xl border py-0 shadow-sm ring-0">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <span className="flex size-8 items-center justify-center rounded-lg border bg-slate-50 text-slate-600"><Icon className="size-4" /></span>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</p>
        <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default async function SmartCollectionsPage() {
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const collections = await getSmartCollections(workspaceId, workspace.timezone ?? "Asia/Karachi");

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><MessageCircle className="size-3.5" />Smart Collections</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Know who to follow up — and message them in one click.</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">MunshiOS turns customer balances and payment terms into a prioritized recovery queue. Version 1 opens WhatsApp with the exact account balance and a prepared reminder; nothing is sent without you pressing Send.</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          No WhatsApp API required for this version.
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total customer receivable" value={formatPKR(collections.summary.totalOpen)} detail={`${collections.rows.length} customer account${collections.rows.length === 1 ? "" : "s"} with an open balance`} icon={CircleDollarSign} />
        <SummaryCard label="Needs contact now" value={formatPKR(collections.summary.dueNow)} detail={`${collections.summary.contactCount} customer${collections.summary.contactCount === 1 ? "" : "s"} at or beyond payment terms`} icon={MessageCircle} />
        <SummaryCard label="30+ days late" value={formatPKR(collections.summary.criticalAmount)} detail={`${collections.summary.criticalCount} critical follow-up${collections.summary.criticalCount === 1 ? "" : "s"}`} icon={AlertTriangle} />
        <SummaryCard label="Missing WhatsApp number" value={collections.summary.missingPhoneCount.toString()} detail="Due customers that need a phone number before messaging" icon={PhoneOff} />
      </section>

      <SmartCollectionsTable rows={collections.rows} workspaceName={workspace.name} />

      <p className="text-[11px] text-slate-400">As of {collections.asOfDate}. Smart Collections is a read-only recovery view; opening WhatsApp or copying a reminder does not modify accounting records.</p>
    </div>
  );
}
