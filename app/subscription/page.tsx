import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, ShieldCheck } from "lucide-react";

import { getCurrentWorkspace } from "@/lib/server/auth";
import { getWorkspaceAccess } from "@/lib/server/subscriptions";
import { SubscriptionRequestForm } from "@/components/subscription/subscription-request-form";

function formatDate(value: Date | null) {
  if (!value) return "No fixed end date";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "long" }).format(value);
}

function statusCopy(reason: string, daysRemaining: number | null) {
  if (reason === "trial") return `Free trial active${daysRemaining !== null ? `, ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining` : ""}.`;
  if (reason === "active") return `Paid access is active${daysRemaining !== null ? ` for ${daysRemaining} more day${daysRemaining === 1 ? "" : "s"}` : ""}.`;
  if (reason === "grace") return `Grace-period access is active${daysRemaining !== null ? ` for ${daysRemaining} more day${daysRemaining === 1 ? "" : "s"}` : ""}.`;
  if (reason === "override") return `Temporary access is active${daysRemaining !== null ? ` for ${daysRemaining} more day${daysRemaining === 1 ? "" : "s"}` : ""}.`;
  return "Normal transactional access is not active.";
}

export default async function SubscriptionPage() {
  const context = await getCurrentWorkspace();
  if (!context) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f7f8f6] px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Finish your business setup</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Create a workspace first. Your 30-day trial starts when the workspace is created.</p>
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
    <main className="min-h-dvh bg-[#f7f8f6] px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="size-3.5" />Dashboard</Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">MunshiOS access</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Plan and subscription</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">See exactly what access your workspace has now. Requesting a paid plan does not charge you automatically.</p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-slate-500">Workspace</p>
              <h2 className="mt-1 break-words text-xl font-semibold">{context.workspace.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{statusCopy(access.reason, access.daysRemaining)}</p>
            </div>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${access.allowed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {access.status.replaceAll("_", " ")}
            </span>
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><ShieldCheck className="size-3.5" />Current plan</dt>
              <dd className="mt-2 font-semibold">{access.planName || "Starter"}</dd>
              <dd className="mt-1 text-xs text-slate-500">Plan code: {access.planCode || "starter"}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><CalendarDays className="size-3.5" />Access until</dt>
              <dd className="mt-2 font-semibold">{formatDate(endDate)}</dd>
              <dd className="mt-1 text-xs text-slate-500">{access.daysRemaining !== null ? `${access.daysRemaining} day${access.daysRemaining === 1 ? "" : "s"} remaining` : "No countdown for this access state"}</dd>
            </div>
          </dl>

          {access.allowed ? (
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <p>Your workspace can currently use normal MunshiOS transactions. Your data and audit history remain stored even if paid or trial access later ends.</p>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {access.reason === "suspended"
                ? `This workspace is suspended${access.suspensionReason ? `: ${access.suspensionReason}` : "."}`
                : "Your trial or paid access has ended. Request activation below to restore normal transactional use."}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {access.allowed && <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800">Open MunshiOS</Link>}
            <Link href="/pricing" className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Review plans and pricing</Link>
          </div>

          <SubscriptionRequestForm currentPlan={access.planCode} />
        </section>
      </div>
    </main>
  );
}
