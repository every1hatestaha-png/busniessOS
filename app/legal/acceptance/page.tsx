import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { acceptCurrentPolicies } from "@/app/legal/acceptance/actions";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  hasCurrentPolicyAcceptance,
} from "@/lib/legal/policies";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { postAuthDestination } from "@/lib/auth-routing";
import { onboardingRouteFromReturnPath } from "@/lib/saas/provisioning-selection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Policy acceptance",
  robots: { index: false, follow: false },
};

export default async function PolicyAcceptancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextOnboarding = onboardingRouteFromReturnPath(typeof params.next === "string" ? params.next : null);
  const user = await getAuthenticatedUser();
  if (hasCurrentPolicyAcceptance(user)) redirect(postAuthDestination(nextOnboarding, "https://builder-return.invalid"));
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <main className="min-h-dvh bg-[#071821] px-5 py-12 text-white sm:px-6">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="text-sm font-semibold text-emerald-300">MunshiOS</Link>
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Account setup</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Review the current policies</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Before entering a business workspace, confirm the current Terms of Service and acknowledge how MunshiOS handles account and business information.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href="/terms" target="_blank" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]">
              <p className="font-semibold">Terms of Service</p>
              <p className="mt-1 text-xs text-slate-500">Version {CURRENT_TERMS_VERSION}</p>
            </Link>
            <Link href="/privacy" target="_blank" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]">
              <p className="font-semibold">Privacy Policy</p>
              <p className="mt-1 text-xs text-slate-500">Version {CURRENT_PRIVACY_VERSION}</p>
            </Link>
          </div>

          <form action={acceptCurrentPolicies} className="mt-7 space-y-4">
            {nextOnboarding ? <input type="hidden" name="next" value={nextOnboarding} /> : null}
            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm leading-6 text-slate-300">
              <input name="terms" type="checkbox" required className="mt-1 size-4 shrink-0 accent-emerald-500" />
              <span>I agree to the current Terms of Service.</span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm leading-6 text-slate-300">
              <input name="privacy" type="checkbox" required className="mt-1 size-4 shrink-0 accent-emerald-500" />
              <span>I acknowledge the current Privacy Policy.</span>
            </label>

            {error === "required" ? (
              <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-200">
                Please accept both items to continue.
              </p>
            ) : null}

            <button type="submit" className="h-12 w-full rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-[#03251b] transition hover:bg-emerald-400">
              Continue to MunshiOS
            </button>
          </form>

          <p className="mt-5 text-xs leading-5 text-slate-500">
            Acceptance is stored with your MunshiOS user record so the policy version in force for the account is auditable.
          </p>
        </div>
      </div>
    </main>
  );
}
