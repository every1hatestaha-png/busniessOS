import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import { PendingWorkspaceInvitations } from "@/app/onboarding/pending-workspace-invitations";
import {
  isBuilderBusinessType,
  onboardingBusinessTypeForBuilder,
  sanitizeBilling,
  sanitizeProvisioningModules,
} from "@/lib/saas/provisioning-selection";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { listPendingInvitationsForEmail } from "@/lib/server/members";
import { hasVerifiedUnconsumedPayment } from "@/lib/server/prepaid-workspace";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const context = await getCurrentWorkspace();
  const params = await searchParams;
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const createAdditional = rawMode === "new";

  if (context && !createAdditional) redirect("/auth/post-login");
  if (!(await hasVerifiedUnconsumedPayment(user.id))) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f7f8f6] px-5 py-12">
        <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">MunshiOS · Paid onboarding</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Payment required before setup</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">MunshiOS does not offer free trials. Your verified login is ready, but no business workspace will be created until the first payment is independently confirmed.</p>
          <div className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-700">
            <p className="font-semibold">Initial payment: PKR 34,000</p>
            <p className="mt-1">PKR 29,000 implementation plus PKR 5,000 for the first month. Every additional workspace requires a separate verified payment.</p>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-600">Contact MunshiOS at <a className="font-semibold text-emerald-700 underline" href="mailto:founder@munshios.tech">founder@munshios.tech</a> to arrange payment. After bank verification, return here to finish your business setup. We do not currently process online payments.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Link href="/pricing" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">View pricing</Link><Link href="/onboarding" className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white">Check payment status</Link></div>
        </section>
      </main>
    );
  }
  const pendingInvitations = createAdditional ? [] : await listPendingInvitationsForEmail(user.email);
  const rawBusiness = Array.isArray(params.business) ? params.business[0] : params.business;
  const builderBusiness = isBuilderBusinessType(rawBusiness) ? rawBusiness : null;
  const modules = sanitizeProvisioningModules(params.modules);
  const billing = sanitizeBilling(Array.isArray(params.billing) ? params.billing[0] : params.billing);

  return (
    <>
      <PendingWorkspaceInvitations invitations={pendingInvitations} />
      <OnboardingForm
      createAdditional={createAdditional}
      initialValues={{
        email: user.email,
        ownerName: [user.firstName, user.lastName].filter(Boolean).join(" "),
      }}
      provisioning={{
        builderBusiness,
        modules,
        billing,
        businessType: onboardingBusinessTypeForBuilder(builderBusiness),
      }}
      />
    </>
  );
}
