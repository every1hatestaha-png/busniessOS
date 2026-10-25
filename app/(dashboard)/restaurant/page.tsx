import Link from "next/link";
import { Banknote, ChefHat, ChevronRight, LayoutDashboard, ShoppingCart, UtensilsCrossed } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listWorkspaceModules } from "@/lib/server/industry-modules";
import { cn } from "@/lib/utils";

const stations = [
  {
    href: "/restaurant/pos",
    title: "Cashier",
    eyebrow: "Orders & billing",
    description: "Take dine-in, takeaway and delivery orders with the existing secure POS.",
    icon: ShoppingCart,
    className: "bg-emerald-50 text-emerald-700",
  },
  {
    href: "/restaurant/kitchen",
    title: "Kitchen",
    eyebrow: "Live preparation queue",
    description: "Follow confirmed orders, prepare tickets, then mark dishes ready for service.",
    icon: ChefHat,
    className: "bg-amber-50 text-amber-700",
  },
] as const;

export default async function RestaurantPage() {
  const { workspaceId, workspace, role } = await requireWorkspace();
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
  const canManage = role === "OWNER" || role === "ADMIN" || role === "MANAGER";

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <header className="rounded-3xl border border-slate-800 bg-[linear-gradient(125deg,#061c20,#0c4137)] p-6 text-white shadow-sm sm:p-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-200">
          <UtensilsCrossed className="size-4" aria-hidden="true" /> Restaurant workspace
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{workspace.name}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">
          Choose your station. Order entry, kitchen operations, and financial management stay on separate screens.
        </p>
      </header>
      <section aria-label="Restaurant stations" className="grid gap-4 md:grid-cols-2">
        {stations.map((station) => {
          const Icon = station.icon;
          return (
            <Link key={station.href} href={station.href}
              className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm outline-none transition-colors hover:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-600">
              <div className="flex items-start justify-between">
                <span className={cn("grid size-12 place-items-center rounded-2xl", station.className)}>
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <ChevronRight className="size-5 text-slate-400 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </div>
              <p className="mt-7 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">{station.eyebrow}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{station.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{station.description}</p>
              <span className={cn(buttonVariants({ variant: "outline" }), "mt-6 pointer-events-none rounded-xl")}>Open station</span>
            </Link>
          );
        })}
        {canManage && (
          <Link href="/restaurant/manager"
            className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm outline-none transition-colors hover:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-600 md:col-span-2">
            <div className="flex items-start justify-between">
              <span className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                <LayoutDashboard className="size-6" aria-hidden="true" />
              </span>
              <ChevronRight className="size-5 text-slate-400 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
              <Banknote className="size-3.5" aria-hidden="true" /> Owners & managers only
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Manager dashboard</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Review today's sales, orders, occupied tables, cash-shift status and operational readiness.
            </p>
            <span className={cn(buttonVariants({ variant: "outline" }), "mt-5 pointer-events-none rounded-xl")}>Open management</span>
          </Link>
        )}
      </section>
      {!canManage && <p className="text-xs text-slate-500">Financial dashboards and manager controls require an owner, admin or manager role.</p>}
    </main>
  );
}
