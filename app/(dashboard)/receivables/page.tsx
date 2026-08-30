import { Banknote, Clock4, CreditCard } from "lucide-react";

import { PageHeader } from "@/components/business/page-header";
import { MetricCard } from "@/components/business/metric-card";
import { PrintButton } from "@/components/invoices/print-button";
import { ReceivablesTable } from "@/components/receivables/receivables-table";
import { ReportCompanyHeader } from "@/components/reports/report-company-header";
import { RECEIVABLES_BUCKET_ORDER } from "@/lib/server/aging";
import { requirePermission } from "@/lib/server/authorization";
import { listCustomers } from "@/lib/server/customers";
import { getReceivablesAging } from "@/lib/server/receivables";
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

export default async function ReceivablesPage({ searchParams }: { searchParams: SearchParams }) {
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const query = await searchParams;
  const search = scalar(query.search);
  const customerId = scalar(query.customerId);
  const bucketValue = scalar(query.bucket);
  const asOfValue = scalar(query.asOf);
  const asOf = parseDate(asOfValue);
  const bucket = (["current", ...RECEIVABLES_BUCKET_ORDER] as string[]).includes(bucketValue)
    ? bucketValue as "current" | (typeof RECEIVABLES_BUCKET_ORDER)[number]
    : undefined;
  const [report, customers] = await Promise.all([
    getReceivablesAging(workspaceId, {
      search: search || undefined,
      customerId: customerId || undefined,
      bucket,
      asOf,
      timeZone: workspace.timezone,
    }),
    listCustomers(workspaceId),
  ]);
  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Receivables" description={`Outstanding customer invoices as of ${report.asOfDate}.`} />
        <div className="print:hidden"><PrintButton label="Print aging" /></div>
      </div>
      <div className="hidden print:block"><ReportCompanyHeader workspace={workspace} title="Accounts Receivable Aging" from={report.asOfDate} to={report.asOfDate} subtitle="Outstanding customer invoices and applied settlements" /></div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <MetricCard label="Total Receivable" value={formatPKR(report.totalOutstanding)} detail={`${report.customers.length} customers`} icon={Banknote} />
        <MetricCard label="Unapplied Credit" value={formatPKR(report.totalUnappliedCredit)} detail="Held separately" icon={CreditCard} />
        <MetricCard label="On-account Receipts" value={formatPKR(report.totalUnappliedPayments)} detail="Not allocated to invoices" icon={CreditCard} />
        <MetricCard label="Current" value={formatPKR(report.buckets.current)} detail="Not overdue" icon={Clock4} />
        {RECEIVABLES_BUCKET_ORDER.map((bucket) => <MetricCard key={bucket} label={bucket} value={formatPKR(report.buckets[bucket])} detail="Age bucket" icon={Clock4} />)}
      </section>
      <ReceivablesTable
        report={report}
        customers={customers.map((customer) => ({ id: customer.id, name: customer.companyName }))}
        filters={{ search, customerId, bucket: bucket ?? "", asOf: asOf ? asOfValue : report.asOfDate }}
      />
    </div>
  );
}
