import Image from "next/image";
import Link from "next/link";
import { Activity, Building2, CircleDollarSign, Clock3, ShieldCheck, Users } from "lucide-react";

import { AdminSignOut } from "@/components/admin/admin-signout";
import { WorkspaceAccountManager } from "@/components/platform/workspace-account-manager";
import { requirePlatformMfa } from "@/lib/server/platform-security";
import { getPlatformDashboard } from "@/lib/server/subscriptions";

export const maxDuration = 60;

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium" }).format(value);
}

export default async function PlatformPage() {
  await requirePlatformMfa();
  const { workspaces, metrics } = await getPlatformDashboard();
  const totalMembers = workspaces.reduce((sum, workspace) => sum + workspace.memberCount, 0);
  const activationRequests = workspaces.filter((workspace) => workspace.activationRequestedAt).length;

  const accounts = workspaces.map((workspace) => {
    const accessEnd = workspace.status === "TRIALING" ? workspace.trialEndsAt : workspace.currentPeriodEnd ?? workspace.graceEndsAt;
    return {
      id: workspace.workspaceId,
      name: workspace.workspaceName,
      city: workspace.workspaceCity || "Pakistan",
      email: workspace.ownerEmail || workspace.workspaceEmail || "No email",
      plan: workspace.planName || "Unassigned",
      planCode: workspace.planCode || "starter",
      status: workspace.status,
      memberCount: workspace.memberCount,
      accessEnd: formatDate(accessEnd),
      requestedPlan: workspace.activationRequest?.planCode ?? null,
      requestedAt: workspace.activationRequestedAt ? formatDate(workspace.activationRequestedAt) : null,
    };
  });

  const stats = [
    { label: "Customer accounts", value: metrics.total, icon: Building2 },
    { label: "Accessible", value: metrics.active, icon: Activity },
    { label: "Active paid", value: metrics.paid, icon: CircleDollarSign },
    { label: "Free trials", value: metrics.trials, icon: Clock3 },
    { label: "Suspended", value: metrics.suspended, icon: ShieldCheck },
    { label: "Expired", value: metrics.expired, icon: Clock3 },
    { label: "Unassigned", value: workspaces.filter((w) => w.status === "UNASSIGNED").length, icon: Building2 },
    { label: "Members", value: totalMembers, icon: Users },
    { label: "Activation requests", value: activationRequests, icon: Activity },
  ];

  return (
    <main className="min-h-dvh bg-[#f8faf9] text-slate-900">
      <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="border-b border-[#1f302c] bg-[#0b161b] text-white lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3 px-5 py-6">
            <div className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white shadow-sm">
              <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={32} height={32} priority />
            </div>
            <div><p className="text-lg font-semibold tracking-tight">MunshiOS</p><p className="text-[11px] uppercase tracking-widest text-emerald-300">Admin console</p></div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:pb-0" aria-label="Platform administration">
            <Link href="#overview" className="block shrink-0 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">Overview</Link>
            <Link href="#customer-accounts" className="block shrink-0 rounded-xl px-4 py-3 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white">Customer accounts</Link>
            <Link href="/admin/security" className="block shrink-0 rounded-xl px-4 py-3 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white">Security & MFA</Link>
          </nav>
          <div className="hidden border-t border-white/10 px-5 py-5 text-xs leading-6 text-slate-500 lg:mt-6 lg:block">
            Verified owner access. Financial data stays within each customer workspace.
          </div>
        </aside>
        <div className="min-w-0">
          <header className="border-b border-slate-200 bg-white/90 px-5 py-6 sm:px-8 lg:px-10">
            <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Platform operations</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Administration overview</h1><p className="mt-2 text-sm text-slate-500">Customer lifecycle, access and subscriptions in one secure workspace.</p></div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><ShieldCheck className="size-4" /> MFA verified</span>
                <AdminSignOut />
              </div>
            </div>
          </header>
          <div className="mx-auto max-w-[1440px] space-y-7 px-5 py-7 sm:px-8 lg:px-10">
            <section id="overview" className="scroll-mt-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div><h2 className="text-lg font-semibold tracking-tight">Business overview</h2><p className="mt-1 text-xs text-slate-500">Live account and subscription status from the business database.</p></div>
                <Link href="/admin/security" className="text-xs font-semibold text-emerald-700 hover:underline">Verify authenticator</Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-start justify-between gap-4 rounded-2xl border border-[#e2e8e5] bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.025)]">
                    <div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</p></div>
                    <div className="rounded-xl bg-slate-50 p-2.5 text-emerald-700"><Icon aria-hidden="true" className="size-4" /></div>
                  </div>
                ))}
              </div>
            </section>
            <WorkspaceAccountManager workspaces={accounts} />
            <p className="text-center text-xs text-slate-500">Permanent deletion requires confirmed owner identity, recent MFA and multiple explicit confirmations. Snapshots and external exports have separate retention.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
