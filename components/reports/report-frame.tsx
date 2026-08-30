import Link from "next/link";
import type { ReactNode } from "react";

import { PrintButton } from "@/components/invoices/print-button";
import { ReportCompanyHeader } from "@/components/reports/report-company-header";

type WorkspaceDetails = Parameters<typeof ReportCompanyHeader>[0]["workspace"];

export function ReportFrame({ workspace, title, from, to, subtitle, filters, children }: { workspace: WorkspaceDetails; title: string; from?: string | Date; to?: string | Date; subtitle?: string; filters?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1400px] space-y-3 print:max-w-none print:space-y-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/reports" className="text-sm font-medium text-neutral-500 hover:text-neutral-950">Reports / {title}</Link>
        <PrintButton label="Print report" />
      </div>
      {filters}
      <article className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <ReportCompanyHeader workspace={workspace} title={title} from={from} to={to} subtitle={subtitle} />
        <div className="mt-5">{children}</div>
      </article>
    </div>
  );
}
