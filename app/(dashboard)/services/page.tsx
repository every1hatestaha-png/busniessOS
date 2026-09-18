import Link from "next/link";
import { BriefcaseBusiness, FileCheck2, ReceiptText } from "lucide-react";

import { ServicesControls } from "@/app/(dashboard)/services/services-controls";
import { ServicesLifecycleControls } from "@/app/(dashboard)/services/services-lifecycle-controls";
import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listCustomers } from "@/lib/server/customers";
import {
  getIndustryHealth,
  listServiceJobs,
  listServiceQuotes,
  listWorkspaceModules,
} from "@/lib/server/industry-modules";
import { formatPKR } from "@/lib/utils";

export default async function ServicesPage() {
  const { workspaceId } = await requireWorkspace();
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some((module) => module.moduleKey === "services" && module.enabled)) return <ModuleDisabled />;

  const [health, quotes, jobs, customers] = await Promise.all([
    getIndustryHealth(workspaceId),
    listServiceQuotes(workspaceId),
    listServiceJobs(workspaceId),
    listCustomers(workspaceId),
  ]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Services" description="Clients, quotations, service jobs, billing, receipts, and expenses." />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Quotations" value={String(health.services.quotations)} detail="Saved service quotations" icon={FileCheck2} />
        <MetricCard label="Open jobs" value={String(health.services.openJobs)} detail="Jobs not completed or cancelled" icon={BriefcaseBusiness} />
        <MetricCard label="Billing engine" value="Connected" detail="Invoices, receipts, and expenses use MunshiOS core" icon={ReceiptText} />
      </section>

      <ServicesControls
        clients={customers.filter((customer) => customer.status === "ACTIVE").map((customer) => ({ id: customer.id, name: customer.companyName || customer.name }))}
        quotes={quotes.map((quote) => ({ id: quote.id, customerId: quote.customerId, quoteNumber: quote.quoteNumber, status: quote.status }))}
      />

      <ServicesLifecycleControls
        quotes={quotes.map((quote) => ({ id: quote.id, quoteNumber: quote.quoteNumber, status: quote.status, customerName: quote.customerName }))}
        jobs={jobs.map((job) => ({ id: job.id, jobNumber: job.jobNumber, title: job.title, status: job.status, customerName: job.customerName }))}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <DataCard title="Quotations" description="Latest 50 service quotations.">
          {quotes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5">Quote</th><th className="px-4 py-2.5">Client</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5">Valid until</th></tr></thead>
                <tbody className="divide-y">{quotes.map((row) => <tr key={row.id}><td className="px-4 py-3 font-medium"><Link href={"/services/quotes/" + row.id} className="text-emerald-700 hover:underline">{row.quoteNumber}</Link></td><td className="px-4 py-3 text-muted-foreground">{row.customerName || "Unknown client"}</td><td className="px-4 py-3"><span className="rounded-full border px-2 py-0.5 text-[11px]">{row.status}</span></td><td className="px-4 py-3 text-right font-medium">{formatPKR(row.total)}</td><td className="px-4 py-3 text-muted-foreground">{row.validUntil ? formatDate(row.validUntil) : "—"}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <Empty text="No service quotations yet." />}
        </DataCard>
        <DataCard title="Service jobs" description="Latest 50 jobs and current workflow state.">
          {jobs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5">Job</th><th className="px-4 py-2.5">Client</th><th className="px-4 py-2.5">Title</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Scheduled</th></tr></thead>
                <tbody className="divide-y">{jobs.map((row) => <tr key={row.id}><td className="px-4 py-3 font-medium"><Link href={"/services/jobs/" + row.id} className="text-emerald-700 hover:underline">{row.jobNumber}</Link></td><td className="px-4 py-3 text-muted-foreground">{row.customerName || "Unknown client"}</td><td className="px-4 py-3">{row.title}</td><td className="px-4 py-3"><span className="rounded-full border px-2 py-0.5 text-[11px]">{row.status}</span></td><td className="px-4 py-3 text-muted-foreground">{row.scheduledAt ? formatDate(row.scheduledAt) : "—"}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <Empty text="No service jobs yet." />}
        </DataCard>
      </div>

      <Card className="rounded-md border shadow-none ring-0"><CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink href="/customers" title="Clients" description="Manage service customers and balances." />
        <QuickLink href="/invoices" title="Billing" description="Issue and review customer invoices." />
        <QuickLink href="/collections" title="Receipts" description="Follow up receivables and collections." />
        <QuickLink href="/accounting/expenses" title="Expenses" description="Track operating and job-related expenses." />
      </CardContent></Card>
    </div>
  );
}

function DataCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardContent className="p-0"><div className="border-b px-4 py-3"><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>{children}</CardContent></Card>; }
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr>{headers.map((header) => <th key={header} className="px-4 py-2.5">{header}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex === 0 ? "px-4 py-3 font-medium" : "px-4 py-3 text-muted-foreground"}>{cell}</td>)}</tr>)}</tbody></table></div>; }
function Empty({ text }: { text: string }) { return <div className="p-5 text-sm text-muted-foreground">{text}</div>; }
function QuickLink({ href, title, description }: { href: string; title: string; description: string }) { return <Link href={href} className="rounded-lg border p-4 transition hover:bg-muted/40"><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></Link>; }
function formatDate(value: Date) { return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(value); }
function ModuleDisabled() { return <div className="mx-auto max-w-3xl py-12"><Card><CardContent className="space-y-3 p-6"><h1 className="text-xl font-semibold">Services module unavailable</h1><p className="text-sm text-muted-foreground">Services workflows are not enabled for this workspace.</p><Link href="/subscription" className="text-sm font-semibold text-emerald-700 hover:underline">View workspace access</Link></CardContent></Card></div>; }
