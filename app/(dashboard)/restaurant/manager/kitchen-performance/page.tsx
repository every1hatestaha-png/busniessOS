import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChefHat, Clock3, Gauge, Timer, TriangleAlert } from "lucide-react";

import { requireWorkspace } from "@/lib/server/auth";
import { listWorkspaceModules } from "@/lib/server/industry-modules";
import { getRestaurantKitchenPerformance } from "@/lib/server/restaurant-kitchen-performance";
import { isRestaurantManager } from "@/lib/restaurant/station-policy";

function duration(n: number | null) {
  return n === null ? "No data" : `${n.toLocaleString("en-PK", { maximumFractionDigits: 1 })} min`;
}

export default async function RestaurantKitchenPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { workspaceId, role, workspace } = await requireWorkspace();
  if (!isRestaurantManager(role)) redirect("/restaurant");
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some(m => m.moduleKey === "restaurant" && m.enabled)) redirect("/restaurant");
  const days = (await searchParams).period === "30" ? 30 : 7;
  const data = await getRestaurantKitchenPerformance(workspaceId, days);
  const cardData = [
    { name: "Prepared tickets", value: String(data.prepared), note: "Ready-at timestamp during period", icon: ChefHat },
    { name: "Average prep time", value: duration(data.meanMinutes), note: "Start preparing to Ready", icon: Clock3 },
    { name: "90th percentile", value: duration(data.p90Minutes), note: "90% of tickets finished by this time", icon: Gauge },
    { name: "Prep time 20+ min", value: String(data.delayed20), note: "Actual preparation duration", icon: TriangleAlert },
    { name: "Waiting 10+ min", value: String(data.waitingOver10), note: "Current unstarted KOT queue", icon: Timer },
    { name: "Preparing 20+ min", value: String(data.preparingOver20), note: "Current in-progress kitchen tickets", icon: Timer },
  ];
  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/restaurant/manager" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
          <ArrowLeft className="size-4" aria-hidden="true" /> Manager
        </Link>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Private operations analysis</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Kitchen performance</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              {workspace.name}. Measured from actual kitchen ticket timestamps, without prices or employee financial data.
            </p>
          </div>
          <nav aria-label="Reporting period" className="flex w-fit gap-1 rounded-2xl bg-slate-100 p-1.5">
            {([7,30] as const).map(value => (
              <Link key={value} href={`/restaurant/manager/kitchen-performance?period=${value}`}
                aria-current={days === value ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${days === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}>{value} days</Link>
            ))}
          </nav>
        </div>
      </header>
      <section aria-label="Kitchen key performance indicators" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cardData.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.name} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Icon className="size-4 text-emerald-700" aria-hidden="true" /> {card.name}
              </p>
              <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-slate-950">{card.value}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{card.note}</p>
            </div>
          );
        })}
      </section>
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-950">Current kitchen queue</h2>
        <p className="mt-1 text-sm text-slate-600">Full queue counts, not limited to the Kitchen screen&apos;s visible ticket cards.</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[["Waiting", data.waiting], ["Preparing", data.preparing], ["Ready", data.ready]].map(([name, value]) => (
            <div key={String(name)} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-600">{name}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
        <div className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-950">Daily preparation history</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Daily average excludes KOTs without both preparation start and ready timestamps.</p>
        </div>
        {data.byDay.length === 0 ? <p className="border-t border-slate-100 px-6 py-8 text-sm text-slate-600">No completed kitchen preparation measurements for this period.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600"><tr>
                <th scope="col" className="px-6 py-3">Local date</th>
                <th scope="col" className="px-6 py-3 text-right">Tickets prepared</th>
                <th scope="col" className="px-6 py-3 text-right">Average prep</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.byDay.map(day => <tr key={day.day}>
                  <td className="px-6 py-4 font-medium text-slate-900">{day.day}</td>
                  <td className="px-6 py-4 text-right tabular-nums">{day.prepared}</td>
                  <td className="px-6 py-4 text-right tabular-nums">{duration(day.meanMinutes)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs leading-6 text-slate-500">
        A ticket&apos;s preparation time starts when Kitchen moves it to Preparing. Waiting time starts at ticket creation.
        These are operational measurements, not guaranteed customer delivery times. Cancelled KOTs are excluded from preparation averages.
      </p>
    </main>
  );
}
