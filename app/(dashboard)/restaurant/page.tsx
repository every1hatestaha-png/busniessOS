import Link from "next/link";
import { ChefHat, Clock3, LayoutGrid, PackageOpen } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { getIndustryHealth, listRestaurantTables, listWorkspaceModules } from "@/lib/server/industry-modules";

export default async function RestaurantPage() {
  const { workspaceId } = await requireWorkspace();
  const modules = await listWorkspaceModules(workspaceId);
  const enabled = modules.some((module) => module.moduleKey === "restaurant" && module.enabled);

  if (!enabled) {
    return <ModuleDisabled title="Restaurant" description="Restaurant workflows are not enabled for this workspace." />;
  }

  const [health, tables] = await Promise.all([
    getIndustryHealth(workspaceId),
    listRestaurantTables(workspaceId),
  ]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Restaurant" description="Tables, kitchen flow, recipes, and ingredient-aware operations." />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Tables" value={String(health.restaurant.tables)} detail="Configured dining tables" icon={LayoutGrid} />
        <MetricCard label="Active recipes" value={String(health.restaurant.recipes)} detail="Recipes connected to inventory" icon={ChefHat} />
        <MetricCard label="Kitchen queue" value={String(health.restaurant.openKitchenTickets)} detail="Queued, preparing, or ready" icon={Clock3} />
      </section>

      <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <p className="text-sm font-medium">Table register</p>
              <p className="text-xs text-muted-foreground">Live restaurant table state for this workspace.</p>
            </div>
            <Link href="/sales/new" className="text-sm font-semibold text-emerald-700 hover:underline">New sale</Link>
          </div>
          {tables.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr><th className="px-4 py-2.5">Table</th><th className="px-4 py-2.5">Area</th><th className="px-4 py-2.5">Capacity</th><th className="px-4 py-2.5">Status</th></tr>
                </thead>
                <tbody className="divide-y">
                  {tables.map((table) => (
                    <tr key={table.id}>
                      <td className="px-4 py-3 font-medium">{table.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{table.area || "—"}</td>
                      <td className="px-4 py-3">{table.capacity}</td>
                      <td className="px-4 py-3"><span className="rounded-full border px-2 py-1 text-xs font-medium">{table.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
              <PackageOpen className="size-5" /> No restaurant tables configured yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ModuleDisabled({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-3xl py-12">
      <Card><CardContent className="space-y-3 p-6"><h1 className="text-xl font-semibold">{title} module unavailable</h1><p className="text-sm text-muted-foreground">{description}</p><Link href="/subscription" className="text-sm font-semibold text-emerald-700 hover:underline">View workspace access</Link></CardContent></Card>
    </div>
  );
}
