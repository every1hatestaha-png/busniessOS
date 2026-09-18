import Link from "next/link";
import { Boxes, Factory, PackageCheck, Warehouse } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { getIndustryHealth, listWorkspaceModules } from "@/lib/server/industry-modules";

export default async function ManufacturingPage() {
  const { workspaceId } = await requireWorkspace();
  const modules = await listWorkspaceModules(workspaceId);
  const enabled = modules.some((module) => module.moduleKey === "manufacturing" && module.enabled);

  if (!enabled) {
    return <ModuleDisabled />;
  }

  const health = await getIndustryHealth(workspaceId);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Manufacturing" description="BOMs, production runs, warehouses, material consumption, and finished goods." />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Warehouses" value={String(health.manufacturing.warehouses)} detail="Active warehouse locations" icon={Warehouse} />
        <MetricCard label="Active BOMs" value={String(health.manufacturing.boms)} detail="Production recipes and material plans" icon={Boxes} />
        <MetricCard label="Open production" value={String(health.manufacturing.openProductionRuns)} detail="Draft or approved runs" icon={Factory} />
      </section>

      <Card className="rounded-md border shadow-none ring-0">
        <CardContent className="grid gap-4 p-5 md:grid-cols-3">
          <WorkflowCard title="1. Raw material" description="Purchase and receive material through PO → GRN so inventory is authoritative." href="/purchases" label="Open purchases" />
          <WorkflowCard title="2. Production" description="BOM and production services enforce approvals, stock checks, wastage, and traceability." href="/inventory" label="Review inventory" />
          <WorkflowCard title="3. Finished goods" description="Posted production adds finished stock and updates weighted cost atomically." href="/reports/current-stock" label="Current stock" />
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><PackageCheck className="size-4" />Production posting is connected to the same inventory ledger used across MunshiOS.</div>
    </div>
  );
}

function WorkflowCard({ title, description, href, label }: { title: string; description: string; href: string; label: string }) {
  return <div className="rounded-lg border bg-muted/20 p-4"><p className="font-semibold">{title}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p><Link href={href} className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline">{label}</Link></div>;
}

function ModuleDisabled() {
  return <div className="mx-auto max-w-3xl py-12"><Card><CardContent className="space-y-3 p-6"><h1 className="text-xl font-semibold">Manufacturing module unavailable</h1><p className="text-sm text-muted-foreground">Manufacturing workflows are not enabled for this workspace.</p><Link href="/subscription" className="text-sm font-semibold text-emerald-700 hover:underline">View workspace access</Link></CardContent></Card></div>;
}
