import { ArrowDownCircle, Clock4 } from "lucide-react";
import { PageHeader } from "@/components/business/page-header";
import { MetricCard } from "@/components/business/metric-card";
import { PrintButton } from "@/components/invoices/print-button";
import { PayablesTable } from "@/components/payables/payables-table";
import { requireWorkspace } from "@/lib/server/auth";
import { getPayablesAging } from "@/lib/server/payables";
import { PAYABLES_BUCKET_ORDER } from "@/lib/server/aging";
import { formatPKR } from "@/lib/utils";

export default async function PayablesPage() {
  const { workspaceId, role, workspace } = await requireWorkspace();
  if (role === "STAFF") {
    return <div className="space-y-6"><PageHeader title="Payables" description="Supplier bills aged by how long they have been outstanding." /><p className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">You do not have permission to view payables.</p></div>;
  }
  const report = await getPayablesAging(workspaceId, { timeZone: workspace.timezone });
  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Payables" description={`Outstanding supplier bills as of ${report.asOfDate}.`} />
        <div className="print:hidden"><PrintButton label="Print aging" /></div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total Payable" value={formatPKR(report.totalOutstanding)} detail={`${report.suppliers.length} suppliers`} icon={ArrowDownCircle} />
        {PAYABLES_BUCKET_ORDER.map((bucket) => (
          <MetricCard
            key={bucket}
            label={bucket === "61+" ? "61+ Days" : bucket}
            value={formatPKR(report.buckets[bucket])}
            detail="Age bucket"
            icon={Clock4}
          />
        ))}
      </section>
      <PayablesTable report={report} />
    </div>
  );
}
