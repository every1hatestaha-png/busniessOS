import Link from "next/link";
import type { ReactNode } from "react";

import { PrintButton } from "@/components/invoices/print-button";
import { ExportCsvButton } from "@/components/reports/export-csv-button";
import { ReportCompanyHeader } from "@/components/reports/report-company-header";

type WorkspaceDetails = Parameters<typeof ReportCompanyHeader>[0]["workspace"];

export function ReportFrame({ workspace, title, from, to, subtitle, filters, children, printable = true, actions }: { workspace: WorkspaceDetails; title: string; from?: string | Date; to?: string | Date; subtitle?: string; filters?: ReactNode; children: ReactNode; printable?: boolean; actions?: ReactNode }) {
  return (
    <div className="mx-auto min-w-0 max-w-[1400px] space-y-3 print:max-w-none print:space-y-0">
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link href="/reports" className="min-w-0 break-words text-sm font-medium text-neutral-500 hover:text-neutral-950">Reports / {title}</Link>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}{printable && <ExportCsvButton title={title} />}<PrintButton label="Print report" disabled={!printable} /></div>
      </div>
      {filters}
      <article data-print-surface data-print-orientation="portrait" className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <ReportCompanyHeader workspace={workspace} title={title} from={from} to={to} subtitle={subtitle} />
        <div className="mt-5 min-w-0 overflow-x-auto print:mt-3 print:overflow-visible">{children}</div>
      </article>
    </div>
  );
}
