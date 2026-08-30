import { Banknote, Clock4, CreditCard } from "lucide-react";

import { PageHeader } from "@/components/business/page-header";
import { MetricCard } from "@/components/business/metric-card";
import { PrintButton } from "@/components/invoices/print-button";
import { ReceivablesTable } from "@/components/receivables/receivables-table";
import { RECEIVABLES_BUCKET_ORDER } from "@/lib/server/aging";
import { requireWorkspace } from "@/lib/server/auth";
import { getReceivablesAging } from "@/lib/server/receivables";
import { formatPKR } from "@/lib/utils";

export default async function ReceivablesPage() {
  const { workspaceId, role, workspace } = await requireWorkspace();
  if (role === "STAFF") {
    return <div className="space-y-6"><PageHeader title="Receivables" description="Customer invoices aged by outstanding amount." /><p className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">You do not have permission to view receivables.</p></div>;
  }
  const report = await getReceivablesAging(workspaceId, { timeZone: workspace.timezone });
  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Receivables" description={`Outstanding customer invoices as of ${report.asOfDate}.`} />
        <div className="print:hidden"><PrintButton label="Print aging" /></div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <MetricCard label="Total Receivable" value={formatPKR(report.totalOutstanding)} detail={`${report.customers.length} customers`} icon={Banknote} />
        <MetricCard label="Unapplied Credit" value={formatPKR(report.totalUnappliedCredit)} detail="Held separately" icon={CreditCard} />
        {RECEIVABLES_BUCKET_ORDER.map((bucket) => <MetricCard key={bucket} label={bucket} value={formatPKR(report.buckets[bucket])} detail="Age bucket" icon={Clock4} />)}
      </section>
      <ReceivablesTable report={report} />
    </div>
  );
}
