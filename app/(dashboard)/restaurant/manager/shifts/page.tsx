import Link from "next/link";
import { redirect } from "next/navigation";
import { reviewRestaurantCashVarianceAction } from "@/app/(dashboard)/restaurant/actions";
import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";
import { Button } from "@/components/ui/button";
import { listRestaurantCashVarianceReviews } from "@/lib/server/restaurant-shift-review";
import { ArrowLeft, Banknote, CheckCircle2, ClipboardCheck, TriangleAlert } from "lucide-react";

import { requireWorkspace } from "@/lib/server/auth";
import { listWorkspaceModules, listCashShifts } from "@/lib/server/industry-modules";
import { isRestaurantManager } from "@/lib/restaurant/station-policy";
import { cn } from "@/lib/utils";

const money = (value: number) => `Rs ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function RestaurantShiftReconciliationPage() {
  const { workspaceId, workspace, role } = await requireWorkspace();
  // A direct URL is never permission. Do not read cash variance history for staff.
  if (!isRestaurantManager(role)) redirect("/restaurant");
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some(module => module.moduleKey === "restaurant" && module.enabled)) redirect("/restaurant");

  const shifts = await listCashShifts(workspaceId);
  const closed = shifts.filter(shift => shift.status === "CLOSED" && shift.variance !== null);
  const variances = closed.filter(shift => Math.abs(shift.variance ?? 0) >= 0.01);
  const reviewed = await listRestaurantCashVarianceReviews(workspaceId, variances.map(shift => shift.id));
  const pendingReviews = variances.filter(shift => !reviewed.has(shift.id)).length;
  const open = shifts.filter(shift => shift.status === "OPEN");
  const cashVariance = closed.reduce((sum, shift) => sum + (shift.variance ?? 0), 0);
  const timezone = workspace.timezone || "Asia/Karachi";
  const date = (value: Date | null) => value
    ? new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(value)
    : "Open";

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/restaurant/manager" className="inline-flex items-center gap-2 rounded-xl py-1 text-sm font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
          <ArrowLeft className="size-4" aria-hidden="true" /> Manager
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Private financial operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Cash shift reconciliation</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Compare opening cash, ledger-based expected cash and physically counted closing cash.
          This report shows the 30 most recent shifts. Only managers may read it.
        </p>
      </header>

      <section aria-label="Recent shift reconciliation summary" className="grid gap-3 sm:grid-cols-3">
        <Summary icon={Banknote} title="Open shifts" value={String(open.length)} note="Among the latest 30 shifts" />
        <Summary icon={ClipboardCheck} title="Closed shifts" value={String(closed.length)} note="Recent counted closes" />
        <Summary icon={TriangleAlert} title="Unreviewed cash differences" value={String(pendingReviews)} note={`${variances.length} differences recorded. Combined variance ${money(cashVariance)}`} attention={pendingReviews > 0} />
      </section>

      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm" aria-labelledby="shift-history-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
          <div>
            <h2 id="shift-history-title" className="text-lg font-semibold text-slate-950">Recent shifts</h2>
            <p className="mt-1 text-xs text-slate-500">Closing figures are preserved. Reviewing a difference adds a manager audit event without changing the ledger.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{shifts.length} shown</span>
        </div>
        {shifts.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No cash shifts recorded for this restaurant.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-4">Opened</th>
                  <th scope="col" className="px-4 py-4">Closed</th>
                  <th scope="col" className="px-4 py-4 text-right">Opening</th>
                  <th scope="col" className="px-4 py-4 text-right">Expected</th>
                  <th scope="col" className="px-4 py-4 text-right">Counted</th>
                  <th scope="col" className="px-5 py-4 text-right">Variance</th>
                  <th scope="col" className="px-5 py-4">Manager review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shifts.map(shift => {
                  const difference = shift.variance ?? 0;
                  const nonzero = shift.variance !== null && Math.abs(difference) >= 0.01;
                  const label = shift.status === "OPEN" ? "Open shift" : nonzero
                    ? difference < 0 ? "Cash short" : "Cash over"
                    : "Balanced";
                  return (
                    <tr key={shift.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 font-medium text-slate-900">{date(shift.openedAt)}</td>
                      <td className="px-4 py-4 text-slate-600">{date(shift.closedAt)}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-700">{money(shift.openingCash)}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-700">{shift.expectedCash === null ? "Pending" : money(shift.expectedCash)}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-700">{shift.closingCash === null ? "Pending" : money(shift.closingCash)}</td>
                      <td className="px-5 py-4 text-right">
                        <span className={cn("inline-flex flex-col items-end gap-1 rounded-xl px-3 py-2 text-xs font-semibold tabular-nums",
                          shift.status === "OPEN" ? "bg-slate-100 text-slate-600" :
                          nonzero ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800")}>
                          <span className="flex items-center gap-1">
                            {!nonzero && shift.status !== "OPEN" ? <CheckCircle2 className="size-3" aria-hidden="true" /> : null}
                            {shift.variance === null ? "Pending" : money(difference)}
                          </span>
                          <span className="text-[10px] font-medium">{label}</span>
                        </span>
                      </td>
                      <td className="min-w-[250px] px-5 py-4">
                        {!nonzero ? (
                          <span className="text-xs text-slate-500">No review needed</span>
                        ) : reviewed.has(shift.id) ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                            <CheckCircle2 className="size-4" aria-hidden="true" /> Reviewed
                          </span>
                        ) : (
                          <RestaurantMutationForm action={reviewRestaurantCashVarianceAction} workspaceId={workspaceId}
                            className="flex min-w-[220px] flex-col gap-2">
                            <input type="hidden" name="shiftId" value={shift.id} />
                            <input name="explanation" required minLength={10} maxLength={500}
                              placeholder="Explain the shortage or overage"
                              aria-label={`Review reason for shift ${shift.id}`}
                              className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" />
                            <Button type="submit" size="sm" className="min-h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800">
                              Record review
                            </Button>
                          </RestaurantMutationForm>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Summary({ icon: Icon, title, value, note, attention = false }: {
  icon: typeof Banknote;
  title: string;
  value: string;
  note: string;
  attention?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-600"><Icon className="size-4 text-emerald-700" aria-hidden="true" />{title}</div>
      <p className={cn("mt-4 text-3xl font-semibold tracking-[-0.03em] tabular-nums", attention ? "text-amber-800" : "text-slate-950")}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}
