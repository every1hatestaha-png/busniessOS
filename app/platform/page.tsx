import {
  activateSubscriptionAction,
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
  if (status === "TRIALING") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (status === "SUSPENDED") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

export default async function PlatformPage() {
  const { workspaces, metrics } = await getPlatformDashboard();

  return (
    <main className="min-h-dvh bg-[#f7f8f6] px-4 py-8 text-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">MunshiOS Control Plane</p>
          <h1 className="text-3xl font-semibold tracking-tight">SaaS operations</h1>
          <p className="max-w-3xl text-sm text-slate-600">Manage trials, paid access, grace periods, and suspensions without touching customer accounting data.</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Total", metrics.total],
            ["Accessible", metrics.active],
            ["Trials", metrics.trials],
            ["Paid", metrics.paid],
            ["Suspended", metrics.suspended],
            ["Expired", metrics.expired],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Customer workspaces</h2>
            <p className="mt-1 text-sm text-slate-500">All commercial access changes are audited.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                    <tr key={workspace.workspaceId} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-medium">{workspace.workspaceName}</p>
                        <p className="mt-1 text-xs text-slate-500">{workspace.workspaceCity || "Pakistan"}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{workspace.ownerEmail || workspace.workspaceEmail || "—"}</td>
                      <td className="px-5 py-4">{workspace.planName || "Unassigned"}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass(workspace.status)}`}>
                          {workspace.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{formatDate(accessEnd)}</td>
                      <td className="px-5 py-4 tabular-nums">{workspace.memberCount}</td>
                      <td className="min-w-[440px] px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <form action={extendTrialAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                            <input name="days" type="number" min="1" max="365" defaultValue="7" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                            <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Extend trial</button>
                          </form>

                          <form action={activateSubscriptionAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                            <select name="planCode" defaultValue={workspace.planCode || "starter"} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                              <option value="starter">Starter</option>
                              <option value="business">Business</option>
                              <option value="pro">Pro</option>
                            </select>
                            <input name="days" type="number" min="1" max="3660" defaultValue="30" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                            <button className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800">Activate</button>
                          </form>

                          <form action={grantGraceAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                            <input name="days" type="number" min="1" max="90" defaultValue="7" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                            <button className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100">Grace</button>
                          </form>

                          <form action={suspendSubscriptionAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                            <input name="reason" placeholder="Reason" className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                            <button className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">Suspend</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {workspaces.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">No customer workspaces yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
