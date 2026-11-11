import Link from "next/link";
import { ArrowRight, ClipboardList, ShieldCheck } from "lucide-react";
import { requireWorkspace } from "@/lib/server/auth";
import { assertRestaurantStation } from "@/lib/server/restaurant-stations";
import { listRestaurantTables } from "@/lib/server/industry-modules";
import { listRestaurantMenu } from "@/lib/server/restaurant-workspace";
import { RestaurantPos } from "./restaurant-pos";

export default async function RestaurantPosPage() {
  const { workspaceId, role, user, workspace } = await requireWorkspace();
  await assertRestaurantStation({ workspaceId, role, userId: user.id }, "CASHIER");
  const [menu, tables] = await Promise.all([
    listRestaurantMenu(workspaceId),
    listRestaurantTables(workspaceId),
  ]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <section className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_42px_-32px_rgba(15,23,42,0.32)] sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700"><ClipboardList className="size-4" /> Order Taking</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-slate-950">{workspace.name}</h1>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">Dine-in, takeaway and delivery orders. Confirmed tickets appear on the Kitchen screen.</p>
        </div>
        <Link href="/restaurant/orders" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
          Live order board <ArrowRight className="size-4" />
        </Link>
      </section>
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
        <ShieldCheck className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
        <p className="text-xs leading-5 text-emerald-950">Final prices are verified on the server. Financial reports and management settings are not available to Order Taking staff.</p>
      </div>
      <RestaurantPos
        workspaceId={workspaceId}
        categories={menu.categories.filter((category) => category.isActive)}
        items={menu.items.filter((item) => item.isActive)}
        tables={tables.filter((table) => table.status !== "INACTIVE").map((table) => ({ id: table.id, name: table.name, status: table.status }))}
        canFinancialOverride={role === "OWNER" || role === "ADMIN" || role === "MANAGER"}
      />
    </div>
  );
}
