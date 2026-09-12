import Link from "next/link";

import { getCurrentWorkspace } from "@/lib/server/auth";
import { getWorkspaceAccess } from "@/lib/server/subscriptions";

function formatDate(value: Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "long" }).format(value);
}

export default async function SubscriptionPage() {
  const context = await getCurrentWorkspace();
  if (!context) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f7f8f6] px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">No workspace found</h1>
          <p className="mt-2 text-sm text-slate-600">Create your business workspace before managing subscription access.</p>
          <Link href="/onboarding" className="mt-5 inline-flex rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white">Continue setup</Link>
        </div>
      </main>
    );
  }

  const access = await getWorkspaceAccess(context.workspaceId);
  const endDate = access.reason === "trial"
    ? access.trialEndsAt
    : access.reason === "grace"
      ? access.graceEndsAt
      : access.currentPeriodEnd;

  return (
    <main className="min-h-dvh bg-[#f7f8f6] px-4 py-12 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">MunshiOS</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Subscription access</h1>
          <p className="mt-2 text-sm text-slate-600">Your business data stays safe even when access expires.</p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Workspace</p>
              <h2 className="mt-1 text-xl font-semibold">{context.workspace.name}</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${access.allowed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {access.status}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Plan</dt>
              <dd className="mt-1 font-medium">{access.planName || "Starter"}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Access until</dt>
              <dd className="mt-1 font-medium">{formatDate(endDate)}</dd>
            </div>
          </dl>

          {access.allowed ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              Your workspace currently has access. {access.daysRemaining !== null ? `${access.daysRemaining} day${access.daysRemaining === 1 ? "" : "s"} remaining.` : ""}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {access.reason === "suspended"
                ? `This workspace is suspended${access.suspensionReason ? `: ${access.suspensionReason}` : "."}`
                : "Your trial or paid access has ended. Renew to continue normal transactional use."}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {access.allowed && (
              <Link href="/dashboard" className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">Open MunshiOS</Link>
            )}
            <a href="mailto:support@munshios.com" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Contact support</a>
          </div>
        </section>
      </div>
    </main>
  );
}
