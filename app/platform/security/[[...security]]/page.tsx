import Image from "next/image";
import Link from "next/link";

import { PlatformMfaControls } from "@/components/platform/platform-mfa-controls";
import { getVerifiedPlatformOwnerIdentity } from "@/lib/server/platform-security";

export default async function PlatformSecurityPage() {
  const owner = await getVerifiedPlatformOwnerIdentity();

  return (
    <main className="min-h-dvh bg-[#fafaf8] px-4 py-8 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e2e8e5] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={36} height={36} priority />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">MunshiOS Control Plane</p>
              <h1 className="text-xl font-semibold">Owner security</h1>
              <p className="mt-1 text-xs text-slate-500">{owner.email}</p>
            </div>
          </div>
          <Link href="/platform" className="text-sm font-medium text-emerald-700">Open admin</Link>
        </header>
        <section className="rounded-2xl border border-[#e2e8e5] bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Authenticator verification</h2>
          <PlatformMfaControls />
        </section>
      </div>
    </main>
  );
}
