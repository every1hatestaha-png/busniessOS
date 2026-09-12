// MunshiOS owner control plane
import Image from "next/image";

import {
  activateSubscriptionAction,
  deleteCustomerAccountAction,
  extendTrialAction,
  grantGraceAction,
  suspendSubscriptionAction,
} from "@/app/platform/actions";
import { getPlatformDashboard } from "@/lib/server/subscriptions";

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium" }).format(value);
}

function statusClass(status: string) {
  if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "TRIALING") return "bg-sky-50 text-sky-700 ring-sky-200";
  if (status === "SUSPENDED") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "GRACE") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default async function PlatformPage() {
  const { workspaces, metrics } = await getPlatformDashboard();

  return (
    <main className="min-h-dvh bg-[#fafaf8] text-slate-950">
      <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-[#1e2925] bg-[#0c1115] text-white lg:min-h-dvh lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3 px-6 py-5 lg:px-5">
            <div className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white shadow-sm">
              <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={32} height={32} priority />
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight">MunshiOS</p>
              <p className="text-xs text-slate-400">Control Plane</p>
            </div>
          </div>

          <div className="hidden px-3 pb-6 pt-3 lg:block">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Administration</p>
            <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-3 text-sm font-medium text-emerald-300">
              Customer accounts
            </div>
            <div className="mt-2 rounded-xl px-3 py-3 text-sm text-slate-400">Subscriptions & access</div>
            <div className="mt-2 rounded-xl px-3 py-3 text-sm text-slate-400">Security controls</div>
          </div>

          <div className="hidden border-t border-white/10 px-5 py-5 text-xs text-slate-500 lg:block">
            Platform owner console
          </div>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-[#e2e8e5] bg-white/90 px-5 py-5 backdrop-blur sm:px-7 lg:px-10">
            <div className="mx-auto flex max-w-[1500px] flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">MunshiOS Administration</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">Owner dashboard</h1>
                <p className="mt-1 text-sm text-slate-500">Manage customer access without entering customer accounting data.</p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                <span className="size-2 rounded-full bg-emerald-500" /> Secure owner session
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] space-y-6 px-5 py-7 sm:px-7 lg:px-10">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ["Total", metrics.total],
                ["Accessible", metrics.active],
                ["Trials", metrics.trials],
                ["Paid", metrics.paid],
                ["Suspended", metrics.suspended],
                ["Expired", metrics.expired],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-[#e2e8e5] bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
                </div>
              ))}
            </section>

            <section className="overflow-hidden rounded-xl border border-[#e2e8e5] bg-white shadow-sm">
              <div className="flex flex-col gap-1 border-b border-[#e2e8e5] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">Customer accounts</h2>
                  <p className="mt-1 text-sm text-slate-500">Trials, plans, access controls and account removal.</p>
                </div>
                <p className="text-xs text-slate-400">Destructive actions require exact business-name confirmation.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-[#f7f9f7] text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Business</th>
                      <th className="px-5 py-3">Owner</th>
                      <th className="px-5 py-3">Plan</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Access end</th>
                      <th className="px-5 py-3">Users</th>
                      <th className="px-5 py-3">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workspaces.map((workspace) => {
                      const accessEnd = workspace.status === "TRIALING"
                        ? workspace.trialEndsAt
                        : workspace.currentPeriodEnd ?? workspace.graceEndsAt;

                      return (
                        <tr key={workspace.workspaceId} className="align-top transition-colors hover:bg-slate-50/60">
                          <td className="px-5 py-4">
                            <p className="font-semibold text-slate-900">{workspace.workspaceName}</p>
                            <p className="mt-1 text-xs text-slate-500">{workspace.workspaceCity || "Pakistan"}</p>
                          </td>
                          <td className="px-5 py-4 text-slate-600">{workspace.ownerEmail || workspace.workspaceEmail || "—"}</td>
                          <td className="px-5 py-4 font-medium">{workspace.planName || "Unassigned"}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass(workspace.status)}`}>
                              {workspace.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-slate-600">{formatDate(accessEnd)}</td>
                          <td className="px-5 py-4 tabular-nums">{workspace.memberCount}</td>
                          <td className="min-w-[520px] px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              <form action={extendTrialAction} className="flex items-center gap-1.5">
                                <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                                <input name="days" type="number" min="1" max="365" defaultValue="7" className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" />
                                <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Extend trial</button>
                              </form>

                              <form action={activateSubscriptionAction} className="flex items-center gap-1.5">
                                <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                                <select name="planCode" defaultValue={workspace.planCode || "starter"} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                                  <option value="starter">Starter</option>
                                  <option value="business">Business</option>
                                  <option value="pro">Pro</option>
                                </select>
                                <input name="days" type="number" min="1" max="3660" defaultValue="30" className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" />
                                <button className="rounded-lg bg-[#059669] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#047857]">Activate</button>
                              </form>

                              <form action={grantGraceAction} className="flex items-center gap-1.5">
                                <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                                <input name="days" type="number" min="1" max="90" defaultValue="7" className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" />
                                <button className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100">Grace</button>
                              </form>

                              <form action={suspendSubscriptionAction} className="flex items-center gap-1.5">
                                <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                                <input name="reason" placeholder="Reason" className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" />
                                <button className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">Suspend</button>
                              </form>
                            </div>

                            <form action={deleteCustomerAccountAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                              <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                              <input
                                name="confirmName"
                                placeholder={`Type: ${workspace.workspaceName}`}
                                className="min-w-64 flex-1 rounded-lg border border-red-200 bg-red-50/40 px-2.5 py-1.5 text-xs outline-none placeholder:text-red-300 focus:border-red-400"
                              />
                              <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Delete account</button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                    {workspaces.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-12 text-center text-slate-500">No customer accounts yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
