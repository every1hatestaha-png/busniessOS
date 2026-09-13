import Image from "next/image";
import Link from "next/link";
import { UserProfile } from "@clerk/nextjs";

import { getVerifiedPlatformOwnerIdentity } from "@/lib/server/platform-security";

export default async function PlatformSecurityPage() {
  const owner = await getVerifiedPlatformOwnerIdentity();

  return (
    <main className="min-h-dvh bg-[#fafaf8] px-4 py-8 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#e2e8e5] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl border border-[#dfe7e2] bg-white shadow-sm">
              <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={30} height={30} priority />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">MunshiOS Control Plane</p>
              <h1 className="text-xl font-semibold">Platform security</h1>
            </div>
          </div>
          {owner.twoFactorEnabled ? (
            <Link href="/platform" className="rounded-lg bg-[#059669] px-4 py-2 text-sm font-semibold text-white hover:bg-[#047857]">Return to dashboard</Link>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">MFA required before admin access</span>
          )}
        </header>

        {!owner.twoFactorEnabled && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Enable two-factor authentication from the Security section below. MunshiOS blocks platform administration until MFA is active on the owner account.
          </div>
        )}

        <div className="flex justify-center overflow-hidden rounded-2xl border border-[#e2e8e5] bg-white p-3 shadow-sm sm:p-6">
          <UserProfile
            routing="hash"
            appearance={{
              variables: { colorPrimary: "#059669", colorBackground: "#ffffff", borderRadius: "0.75rem" },
              elements: {
                rootBox: "w-full",
                cardBox: "w-full shadow-none",
                card: "w-full shadow-none border-0",
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
