import Link from "next/link";
import { ChefHat, ChevronRight, LayoutDashboard, ShoppingCart, UtensilsCrossed, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listWorkspaceModules } from "@/lib/server/industry-modules";
import { getRestaurantActorStation } from "@/lib/server/restaurant-stations";
import { canUseRestaurantStation } from "@/lib/restaurant/station-policy";
import { cn } from "@/lib/utils";

const stations = [
  {
    operation: "MANAGER",
    href: "/restaurant/manager",
    title: "Manager",
    eyebrow: "Operations & staff",
    description: "Review all orders, sales, tables, cash shifts and staff assignments. Manager-only controls live here.",
    icon: LayoutDashboard,
    background: "bg-blue-50 text-blue-700",
  },
  {
    operation: "CASHIER",
    href: "/restaurant/pos",
    title: "Order Taking",
    eyebrow: "Counter & service",
    description: "Take dine-in, takeaway and delivery orders. Send each confirmed order straight to the shared kitchen queue.",
    icon: ShoppingCart,
    background: "bg-emerald-50 text-emerald-700",
  },
  {
    operation: "KITCHEN",
    href: "/restaurant/kitchen",
    title: "Kitchen",
    eyebrow: "Live order preparation",
    description: "See item quantities and cooking notes. Move orders from New to Preparing to Ready for service.",
    icon: ChefHat,
    background: "bg-amber-50 text-amber-700",
  },
] as const;

export default async function RestaurantPage() {
  const { workspaceId, workspace, role, user } = await requireWorkspace();
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some((module) => module.moduleKey === "restaurant" && module.enabled)) {
    return (
      <Card className="mx-auto max-w-xl rounded-2xl border shadow-none">
        <CardContent className="p-7">
          <h1 className="text-lg font-semibold">Restaurant workspace unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">The restaurant module is not enabled for this workspace.</p>
        </CardContent>
      </Card>
    );
  }

  const assignedStation = await getRestaurantActorStation({ workspaceId, userId: user.id, role });
  const visibleStations = stations.filter((station) => canUseRestaurantStation(role, assignedStation, station.operation));
  const isManager = canUseRestaurantStation(role, assignedStation, "MANAGER");

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-3xl border border-slate-800 bg-[linear-gradient(125deg,#061c20,#0c4137)] p-6 text-white shadow-sm sm:p-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-200">
          <UtensilsCrossed className="size-4" aria-hidden="true" /> {workspace.name}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Choose your station</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/85">
          One restaurant, three separate work screens. Your account opens only the stations your manager has authorized.
        </p>
      </header>

      <section aria-label="Restaurant station selection" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleStations.map((station) => {
          const Icon = station.icon;
          return (
            <Link
              key={station.href}
              href={station.href}
              className="group flex min-h-[260px] flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm outline-none transition-colors hover:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <div className="flex items-start justify-between">
                <span className={cn("grid size-12 place-items-center rounded-2xl", station.background)}>
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <ChevronRight className="size-5 text-slate-400 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </div>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">{station.eyebrow}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{station.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{station.description}</p>
              <span className="mt-6 text-sm font-semibold text-emerald-700 group-hover:text-emerald-800">Open {station.title}</span>
            </Link>
          );
        })}
      </section>

      {isManager ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <Users className="size-5 shrink-0 text-slate-500" aria-hidden="true" />
          <p className="flex-1">Set up two separate staff logins in this same restaurant, one for Order Taking and one for Kitchen.</p>
          <Link href="/restaurant/manager/staff" className="font-semibold text-emerald-700 underline underline-offset-4">Staff permissions</Link>
        </div>
      ) : visibleStations.length === 0 ? (
        <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          Your account has not been assigned a station. Ask the restaurant manager to grant Order Taking or Kitchen access.
        </p>
      ) : (
        <p className="text-xs text-slate-500">Your staff login has access only to its assigned station.</p>
      )}
    </main>
  );
}
