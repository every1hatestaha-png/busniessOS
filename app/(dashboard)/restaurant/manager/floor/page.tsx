import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, LayoutGrid, Users, Utensils } from "lucide-react";
import { RestaurantStationAutoRefresh } from "@/components/restaurant/station-auto-refresh";
import { requireWorkspace } from "@/lib/server/auth";
import { listRestaurantTables, listWorkspaceModules } from "@/lib/server/industry-modules";
import { listRestaurantReadyTableIds } from "@/lib/server/restaurant-workspace";
import { isRestaurantManager } from "@/lib/restaurant/station-policy";
import { cn } from "@/lib/utils";

export default async function RestaurantFloorPage() {
  const { workspaceId, workspace, role } = await requireWorkspace();
  if (!isRestaurantManager(role)) redirect("/restaurant");
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some(m => m.moduleKey === "restaurant" && m.enabled)) redirect("/restaurant");

  const [tables, readyIds] = await Promise.all([
    listRestaurantTables(workspaceId), listRestaurantReadyTableIds(workspaceId),
  ]);
  const ready = new Set(readyIds);
  const occupied = tables.filter(table => table.status === "OCCUPIED").length;
  const readyCount = tables.filter(table => ready.has(table.id)).length;
  const seats = tables.reduce((sum, table) => sum + table.capacity, 0);
  const areas = new Map<string, typeof tables>();
  for (const table of tables) {
    const name = table.area?.trim() || "Main floor";
    const group = areas.get(name) ?? [];
    group.push(table);
    areas.set(name, group);
  }
  const sortedAreas = [...areas].sort(([a],[b]) => a.localeCompare(b));

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/restaurant/manager" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
          <ArrowLeft className="size-4" /> Manager
        </Link>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">Restaurant floor</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{workspace.name} Floor</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">All configured tables, grouped by area. Live readiness is tenant-scoped, not inferred from a sampled queue.</p>
          </div>
          <RestaurantStationAutoRefresh label="Floor status" intervalSeconds={15} />
        </div>
      </header>

      <section aria-label="Floor totals" className="grid gap-3 sm:grid-cols-3">
        <FloorStat title="Tables" value={String(tables.length)} detail={`${seats} configured seats`} />
        <FloorStat title="Occupied" value={String(occupied)} detail={tables.length ? `${Math.round(occupied/tables.length*100)}% floor utilization` : "No tables"} />
        <FloorStat title="Ready for service" value={String(readyCount)} detail="At least one READY dine-in order" />
      </section>

      {tables.length === 0 ? (
        <section className="rounded-[26px] border border-dashed border-slate-300 bg-white p-10 text-center">
          <LayoutGrid className="mx-auto size-9 text-slate-400" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">No dining tables yet</h2>
          <p className="mt-2 text-sm text-slate-600">Configure table name, capacity and area from Manager to build your floor.</p>
          <Link href="/restaurant/manager" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white">Manage tables</Link>
        </section>
      ) : (
        <div className="space-y-5">
          {sortedAreas.map(([area, members]) => (
            <section key={area} className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label={`${area} tables`}>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">{area}</h2>
                  <p className="mt-1 text-xs text-slate-500">{members.length} tables, {members.reduce((total, table) => total+table.capacity, 0)} seats</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{members.filter(t => t.status === "OCCUPIED").length} occupied</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {members.map(table => {
                  const isReady = ready.has(table.id);
                  const isOccupied = table.status === "OCCUPIED";
                  const status = isReady ? "Ready to serve" : isOccupied ? "Occupied" : table.status === "AVAILABLE" ? "Available" : table.status.replaceAll("_", " ");
                  return (
                    <div key={table.id} className={cn("rounded-[22px] border p-4",
                      isReady ? "border-emerald-300 bg-emerald-50" : isOccupied ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-slate-50/60")}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-base font-semibold text-slate-950">{table.name}</p>
                        {isReady ? <CheckCircle2 className="size-5 shrink-0 text-emerald-700" aria-label="Ready order" /> : <Utensils className="size-4 shrink-0 text-slate-400" aria-hidden="true" />}
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600"><Users className="size-3.5" aria-hidden="true" /> {table.capacity} seats</p>
                      <p className={cn("mt-4 rounded-xl px-3 py-2 text-xs font-semibold",
                        isReady ? "bg-emerald-100 text-emerald-900" : isOccupied ? "bg-amber-100 text-amber-950" : "bg-white text-slate-700")}>{status}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs leading-5 text-slate-500">
        Floor monitoring only. Table transfers are not enabled because original order and kitchen-ticket routing snapshots are immutable.
        Occupancy remains controlled by financial settlement and the preserved order evidence.
      </p>
    </main>
  );
}

function FloorStat({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-semibold text-slate-600">{title}</p>
    <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] tabular-nums text-slate-950">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>;
}
