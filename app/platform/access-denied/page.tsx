import Link from "next/link";
import { redirect } from "next/navigation";

import { getSupabaseAuthUser } from "@/lib/supabase/server";
import { SwitchPlatformAccount } from "@/components/platform/switch-platform-account";

export default async function PlatformAccessDeniedPage() {
  const user = await getSupabaseAuthUser();
  if (!user?.email_confirmed_at) redirect("/sign-in?redirect_url=%2Fplatform");

  return (
    <main className="grid min-h-dvh place-items-center bg-[#fafaf8] px-5 py-10 text-slate-900">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">MunshiOS owner administration</p>
        <h1 className="mt-3 text-2xl font-semibold">This account cannot open the admin portal</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          You are signed in to MunshiOS, but this account is not the registered platform owner.
          Being an owner of a customer business does not grant platform administration access.
        </p>
        <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Signed in as: {user.email ?? "Unknown account"}
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Switch to the registered platform owner account to continue. Your business data remains unchanged.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <SwitchPlatformAccount />
          <Link href="/dashboard" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Return to business</Link>
          <Link href="/" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">MunshiOS home</Link>
        </div>
      </section>
    </main>
  );
}
