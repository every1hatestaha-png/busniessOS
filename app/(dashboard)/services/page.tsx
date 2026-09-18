import Link from "next/link";
import { BriefcaseBusiness, FileCheck2, ReceiptText } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { getIndustryHealth, listWorkspaceModules } from "@/lib/server/industry-modules";

export default async function ServicesPage() {
  const { workspaceId } = await requireWorkspace();
  const modules = await listWorkspaceModules(workspaceId);
  const enabled = modules.some((module) => module.moduleKey === "services" && module.enabled);

  if (!enabled) {
    return <ModuleDisabled />;
  }

  const health = await getIndustryHealth(workspaceId);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Services" description="Clients, quotations, service jobs, billing, receipts, and expenses." />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Quotations" value={String(health.services.quotations)} detail="Saved service quotations" icon={FileCheck2} />
        <MetricCard label="Open jobs" value={String(health.services.openJobs)} detail="Jobs not completed or cancelled" icon={BriefcaseBusiness} />
        <MetricCard label="Billing engine" value="Connected" detail="Invoices, receipts, and expenses use MunshiOS core" icon={ReceiptText} />
      </section>

      <Card className="rounded-md border shadow-none ring-0">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink href="/customers" title="Clients" description="Manage service customers and balances." />
          <QuickLink href="/invoices" title="Billing" description="Issue and review customer invoices." />
          <QuickLink href="/collections" title="Receipts" description="Follow up receivables and collections." />
          <QuickLink href="/accounting/expenses" title="Expenses" description="Track operating and job-related expenses." />
        </CardContent>
      </Card>
    </div>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return <Link href={href} className="rounded-lg border p-4 transition hover:bg-muted/40"><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></Link>;
}

function ModuleDisabled() {
  return <div className="mx-auto max-w-3xl py-12"><Card><CardContent className="space-y-3 p-6"><h1 className="text-xl font-semibold">Services module unavailable</h1><p className="text-sm text-muted-foreground">Services workflows are not enabled for this workspace.</p><Link href="/subscription" className="text-sm font-semibold text-emerald-700 hover:underline">View workspace access</Link></CardContent></Card></div>;
}
