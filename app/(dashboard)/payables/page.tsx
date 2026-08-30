import { ArrowDownCircle, Clock4 } from "lucide-react";
import { PageHeader } from "@/components/business/page-header";
import { MetricCard } from "@/components/business/metric-card";
import { PrintButton } from "@/components/invoices/print-button";
import { PayablesTable } from "@/components/payables/payables-table";
import { ReportCompanyHeader } from "@/components/reports/report-company-header";
import { requirePermission } from "@/lib/server/authorization";
import { getPayablesAging } from "@/lib/server/payables";
import { PAYABLES_BUCKET_ORDER } from "@/lib/server/aging";
import { listSuppliers } from "@/lib/server/suppliers";
import { formatPKR } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? date : undefined;
}

export default async function PayablesPage({ searchParams }: { searchParams: SearchParams }) {
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const query = await searchParams;
  const search = scalar(query.search);
  const supplierId = scalar(query.supplierId);
  const bucketValue = scalar(query.bucket);
  const asOfValue = scalar(query.asOf);
  const asOf = parseDate(asOfValue);
  const bucket = (["current", ...PAYABLES_BUCKET_ORDER] as string[]).includes(bucketValue)
    ? bucketValue as "current" | (typeof PAYABLES_BUCKET_ORDER)[number]
    : undefined;
  const [report, suppliers] = await Promise.all([
    getPayablesAging(workspaceId, {
      search: search || undefined,
      supplierId: supplierId || undefined,
      bucket,
      asOf,
      timeZone: workspace.timezone,
    }),
    listSuppliers(workspaceId),
  ]);
  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Payables" description={`Outstanding supplier bills as of ${report.asOfDate}.`} />
        <div className="print:hidden"><PrintButton label="Print aging" /></div>
      </div>
      <div className="hidden print:block"><ReportCompanyHeader workspace={workspace} title="Accounts Payable Aging" from={report.asOfDate} to={report.asOfDate} subtitle="Outstanding accepted supplier liabilities" /></div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <MetricCard label="Total Payable" value={formatPKR(report.totalOutstanding)} detail={`${report.suppliers.length} suppliers`} icon={ArrowDownCircle} />
        <MetricCard label="Current" value={formatPKR(report.buckets.current)} detail="Not overdue" icon={Clock4} />
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
      <PayablesTable
        report={report}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.companyName ?? supplier.name }))}
        filters={{ search, supplierId, bucket: bucket ?? "", asOf: asOf ? asOfValue : report.asOfDate }}
      />
    </div>
  );
}
