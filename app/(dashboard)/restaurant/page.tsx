import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  ChefHat,
  Clock3,
  LayoutGrid,
  Package,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";

import { RestaurantControls } from "@/app/(dashboard)/restaurant/restaurant-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import {
  getIndustryHealth,
  listCashShifts,
  listRestaurantRecipes,
  listRestaurantTables,
  listWorkspaceModules,
} from "@/lib/server/industry-modules";
import { getRestaurantWorkspaceMetrics, listRestaurantOrders } from "@/lib/server/restaurant-workspace";
import { cn } from "@/lib/utils";

export default async function RestaurantPage() {
  const { workspaceId, role, workspace } = await requireWorkspace();
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some((module) => module.moduleKey === "restaurant" && module.enabled)) {
    return <ModuleDisabled />;
  }

  const [health, tables, recipes, shifts, metrics, liveOrders] = await Promise.all([
    getIndustryHealth(workspaceId),
    listRestaurantTables(workspaceId),
    listRestaurantRecipes(workspaceId),
    listCashShifts(workspaceId),
    getRestaurantWorkspaceMetrics(workspaceId),
    listRestaurantOrders(workspaceId, 40, {
      statuses: ["CONFIRMED", "PREPARING", "READY"],
      oldestFirst: true,
    }),
  ]);

  const openShift = shifts.find((shift) => shift.status === "OPEN");
  const canManage = role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  const occupiedTables = tables.filter((table) => table.status === "OCCUPIED").length;
  const readyTables = new Set(
    liveOrders.filter((order) => order.status === "READY" && order.restaurantTableId).map((order) => order.restaurantTableId),
  );
  const liveByStatus = {
    CONFIRMED: liveOrders.filter((order) => order.status === "CONFIRMED"),
    PREPARING: liveOrders.filter((order) => order.status === "PREPARING"),
    READY: liveOrders.filter((order) => order.status === "READY"),
  };

  return (
    <div className="mx-auto max-w-[1480px] space-y-5">
      <section className="flex flex-col gap-4 rounded-3xl border bg-[linear-gradient(135deg,#071821_0%,#0a2526_58%,#0a3d30_100%)] p-5 text-white shadow-sm sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
            <Sparkles className="size-3.5" />
            Restaurant workspace
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{workspace.name}</h1>
          <p className="mt-1 text-sm text-slate-300">Service, kitchen, tables, stock and cash in one focused workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/restaurant/kitchen" className={cn(buttonVariants({ variant: "outline" }), "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white")}>
            <ChefHat className="size-4" /> Kitchen
          </Link>
          <Link href="/restaurant/pos" className={cn(buttonVariants(), "bg-emerald-500 text-slate-950 hover:bg-emerald-400")}>
            <ShoppingCart className="size-4" /> Open POS
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Today's sales" value={`Rs ${metrics.todaySales.toLocaleString()}`} detail={`${metrics.todayOrders} orders today`} tone="emerald" />
        <Metric label="Live orders" value={String(metrics.liveOrders)} detail={`${metrics.readyOrders} ready for service`} tone="amber" />
        <Metric label="Avg prep time" value={metrics.averagePrepMinutes ? `${metrics.averagePrepMinutes.toFixed(0)} min` : "—"} detail="Kitchen cycle today" tone="blue" />
        <Metric label="Tables occupied" value={`${occupiedTables} / ${tables.length}`} detail={tables.length ? `${Math.round((occupiedTables / tables.length) * 100)}% floor occupancy` : "No tables configured"} tone="emerald" />
        <Metric label="Cash shift" value={openShift ? "OPEN" : "CLOSED"} detail={openShift ? `Rs ${openShift.openingCash.toLocaleString()} opening cash` : "Open a shift before cash service"} tone={openShift ? "emerald" : "red"} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,.9fr)]">
        <Card className="rounded-2xl border shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Live order flow</h2>
                <p className="text-xs text-muted-foreground">What needs attention right now.</p>
              </div>
              <Link href="/restaurant/orders" className="text-xs font-semibold text-emerald-700 hover:underline">View all orders</Link>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <OrderColumn title="New" orders={liveByStatus.CONFIRMED} tone="blue" />
              <OrderColumn title="Preparing" orders={liveByStatus.PREPARING} tone="amber" />
              <OrderColumn title="Ready" orders={liveByStatus.READY} tone="emerald" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Floor status</h2>
                <p className="text-xs text-muted-foreground">{tables.length} configured tables</p>
              </div>
              <LayoutGrid className="size-4 text-muted-foreground" />
            </div>
            {tables.length ? (
              <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-4">
                {tables.slice(0, 24).map((table) => {
                  const ready = readyTables.has(table.id);
                  const occupied = table.status === "OCCUPIED";
                  return (
                    <div
                      key={table.id}
                      className={cn(
                        "grid aspect-square place-items-center rounded-xl border text-xs font-semibold",
                        ready && "border-emerald-500 bg-emerald-500 text-white",
                        !ready && occupied && "border-amber-300 bg-amber-50 text-amber-900",
                        !ready && !occupied && "border-slate-200 bg-slate-50 text-slate-600",
                      )}
                      title={`${table.name} · ${table.status}`}
                    >
                      {table.name.replace(/table/i, "").trim() || table.name}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Add your dining tables below.</div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              <Legend label="Available" className="bg-slate-100 text-slate-600" />
              <Legend label="Occupied" className="bg-amber-100 text-amber-800" />
              <Legend label="Ready" className="bg-emerald-100 text-emerald-800" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,.9fr)]">
        <Card className="rounded-2xl border shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Restaurant readiness</h2>
                <p className="text-xs text-muted-foreground">A quick operational pulse before service.</p>
              </div>
              <UtensilsCrossed className="size-4 text-emerald-600" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Readiness label="Tables" value={String(health.restaurant.tables)} detail="configured" icon={LayoutGrid} />
              <Readiness label="Recipes" value={String(health.restaurant.recipes)} detail="inventory-linked" icon={ChefHat} />
              <Readiness label="Open kitchen" value={String(health.restaurant.openKitchenTickets)} detail="legacy tickets" icon={Clock3} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              <h2 className="text-base font-semibold">Service checklist</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <Checklist ok={Boolean(openShift)} text={openShift ? "Cash shift is open" : "Open cash shift"} />
              <Checklist ok={tables.length > 0} text={tables.length ? `${tables.length} tables ready` : "Configure restaurant tables"} />
              <Checklist ok={recipes.length > 0} text={recipes.length ? `${recipes.length} recipes connected` : "Connect menu recipes to stock"} />
            </div>
          </CardContent>
        </Card>
      </section>

      <RestaurantControls workspaceId={workspaceId} openShiftId={openShift?.id ?? null} canManageTables={canManage} />
    </div>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "emerald" | "amber" | "blue" | "red" }) {
  const dot = tone === "amber" ? "bg-amber-500" : tone === "blue" ? "bg-blue-500" : tone === "red" ? "bg-red-500" : "bg-emerald-500";
  return (
    <Card className="rounded-2xl border shadow-none">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><span className={cn("size-2.5 rounded-full", dot)} /></div>
        <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function OrderColumn({ title, orders, tone }: { title: string; orders: Awaited<ReturnType<typeof listRestaurantOrders>>; tone: "blue" | "amber" | "emerald" }) {
  const badge = tone === "amber" ? "bg-amber-100 text-amber-800" : tone === "blue" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800";
  return (
    <div className="min-w-0 rounded-xl bg-slate-50/80 p-3">
      <div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", badge)}>{orders.length}</span></div>
      <div className="space-y-2">
        {orders.slice(0, 3).map((order) => (
          <Link key={order.id} href="/restaurant/orders" className="block rounded-xl border bg-white p-3 transition hover:border-emerald-300">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{order.orderNumber}</p><span className="text-[10px] font-medium text-muted-foreground">{order.tableName || order.fulfillmentType.replaceAll("_", " ")}</span></div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{order.customerName || "Walk-in customer"}</p>
          </Link>
        ))}
        {!orders.length && <div className="rounded-xl border border-dashed bg-white p-6 text-center text-xs text-muted-foreground">Queue clear</div>}
      </div>
    </div>
  );
}

function Readiness({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Package }) {
  return <div className="rounded-xl border bg-slate-50/70 p-4"><Icon className="size-4 text-emerald-600" /><p className="mt-3 text-xl font-semibold">{value}</p><p className="mt-0.5 text-xs font-medium">{label}</p><p className="text-[11px] text-muted-foreground">{detail}</p></div>;
}

function Legend({ label, className }: { label: string; className: string }) {
  return <span className={cn("rounded-full px-2.5 py-1 font-medium", className)}>{label}</span>;
}

function Checklist({ ok, text }: { ok: boolean; text: string }) {
  return <div className="flex items-center gap-2"><span className={cn("grid size-5 place-items-center rounded-full text-[10px] font-bold", ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{ok ? "✓" : "!"}</span><span className={ok ? "text-slate-700" : "font-medium text-amber-900"}>{text}</span></div>;
}

function ModuleDisabled() {
  return <Card className="mx-auto max-w-xl rounded-2xl"><CardContent className="p-6"><h1 className="text-lg font-semibold">Restaurant workspace unavailable</h1><p className="mt-1 text-sm text-muted-foreground">Enable the Restaurant module for this workspace.</p></CardContent></Card>;
}
