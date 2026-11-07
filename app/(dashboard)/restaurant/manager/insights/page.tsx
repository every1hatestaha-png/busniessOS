import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Banknote, ChartNoAxesCombined, ClipboardList, ReceiptText, RotateCcw, Utensils } from "lucide-react";

import { requireWorkspace } from "@/lib/server/auth";
import { listWorkspaceModules } from "@/lib/server/industry-modules";
import { getRestaurantManagementInsights } from "@/lib/server/restaurant-insights";
import { isRestaurantManager } from "@/lib/restaurant/station-policy";

const currency = (amount: number) => `Rs ${amount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (name: string) => name.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

export default async function RestaurantManagerInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { workspaceId, workspace, role } = await requireWorkspace();
  if (!isRestaurantManager(role)) redirect("/restaurant");
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some(m => m.moduleKey === "restaurant" && m.enabled)) redirect("/restaurant");
  const period = (await searchParams).period === "30" ? 30 : 7;
  const data = await getRestaurantManagementInsights(workspaceId, period);
  const cards = [
    { title: "Completed net sales", value: currency(data.netSales), detail: "Returns deducted from completed orders", icon: ChartNoAxesCombined },
    { title: "Gross completed sales", value: currency(data.grossSales), detail: "Before returns, after order discounts", icon: Banknote },
    { title: "Returns against those orders", value: currency(data.returns), detail: "All returns recorded through now", icon: RotateCcw },
    { title: "Average completed ticket", value: currency(data.avgCompletedOrder), detail: `${data.completedOrders} completed orders`, icon: ReceiptText },
    { title: "Cancelled orders", value: String(data.cancelledOrders), detail: "Created during this date window", icon: ClipboardList },
    { title: "Discounts on completed orders", value: currency(data.discounts), detail: "Already included in original totals", icon: Utensils },
  ];
  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/restaurant/manager" className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          <ArrowLeft className="size-4" aria-hidden="true" /> Manager
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">Private management intelligence</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-4xl">Restaurant Insights</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Completed sales, refunds, payment activity and menu demand. All figures are restricted to {workspace.name}.
            </p>
          </div>
          <nav aria-label="Insights reporting period" className="inline-flex w-fit gap-1 rounded-2xl bg-slate-100 p-1.5">
            {([7,30] as const).map(days => (
              <Link key={days} href={`/restaurant/manager/insights?period=${days}`}
                aria-current={period === days ? "page" : undefined}
                className={`min-h-11 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${period === days ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                {days} days
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <section aria-label="Restaurant financial summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon className="size-4 text-emerald-700" aria-hidden="true" />{card.title}</div>
              <p className="mt-4 text-2xl font-semibold tracking-[-0.035em] tabular-nums text-slate-950">{card.value}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{card.detail}</p>
            </div>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="Sales by service type" description="Net value for completed dine-in, takeaway and delivery orders."
          rows={data.channels.map(row => ({ label: label(row.name), number: currency(row.netSales), detail: `${row.orders} orders` }))}
          empty="No completed restaurant orders during this period." />
        <Breakdown title="Payment methods" description="Non-voided payments collected during the period, before refund allocations."
          rows={data.paymentMethods.map(row => ({ label: label(row.name), number: currency(row.amount), detail: `${row.count} payments` }))}
          empty="No recorded payments during this period." />
      </div>

      <Breakdown title="Popular menu items" description="Gross item quantities on completed orders, before returns and modifiers. This is not a profit report."
        rows={data.popularItems.map(row => ({ label: row.name, number: `${row.quantity.toLocaleString()} sold`, detail: currency(row.grossValue) }))}
        empty="No completed menu item sales during this period." />

      <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
        Sales use each order&apos;s completion date in the restaurant&apos;s local timezone. Returns recorded later are reflected against those orders.
        Payment method totals use payment collection dates and exclude voids, but are not adjusted for refunds.
        The figures have different accounting boundaries, so do not add the payment totals to sales or treat the item ranking as profit.
      </p>
    </main>
  );
}

function Breakdown({ title, description, rows, empty }: {
  title: string;
  description: string;
  rows: { label: string; number: string; detail: string }[];
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      {rows.length === 0
        ? <p className="px-6 py-10 text-sm text-slate-500">{empty}</p>
        : <ul className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <li key={`${row.label}-${i}`} className="flex items-center gap-4 px-5 py-4 sm:px-6">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-50 text-xs font-semibold tabular-nums text-slate-600">{i+1}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{row.label}</p><p className="mt-1 text-xs text-slate-500">{row.detail}</p></div>
              <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-950">{row.number}</p>
              <ArrowUpRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
            </li>
          ))}
        </ul>}
    </section>
  );
}
