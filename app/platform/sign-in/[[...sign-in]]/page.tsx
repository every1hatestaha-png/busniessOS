import Image from "next/image";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getVerifiedPlatformOwnerIdentity, markPlatformPasswordVerified } from "@/lib/server/platform-security";

async function verifyPlatformPassword(formData: FormData) {
  "use server";

  const password = String(formData.get("password") ?? "");
  if (!password) redirect("/platform/sign-in?reauth=1&error=missing");

  const owner = await getVerifiedPlatformOwnerIdentity();
  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  const sessionId = "sessionId" in session ? session.sessionId : null;
  if (!userId || !sessionId || userId !== owner.id) redirect("/platform/sign-in");

  let verified = false;
  try {
    await (await clerkClient()).users.verifyPassword({ userId, password });
    verified = true;
  } catch {
    verified = false;
  }

  if (!verified) redirect("/platform/sign-in?reauth=1&error=invalid");

  await markPlatformPasswordVerified(sessionId);
  redirect("/platform");
}

function BrandHeader() {
  return (
    <div className="mb-7 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
        <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={38} height={38} priority />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#059669]">MunshiOS Control Plane</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0f172a]">Owner sign in</h1>
      <p className="mt-2 text-sm text-[#64748b]">Secure access to platform administration</p>
    </div>
  );
}

export default async function PlatformSignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  const params = await searchParams;

  if (!userId) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#fafaf8] px-4 py-10 text-[#0f172a]">
        <div className="w-full max-w-md">
          <BrandHeader />
          <div className="flex justify-center">
            <SignIn
              routing="path"
              path="/platform/sign-in"
              forceRedirectUrl="/platform/sign-in?reauth=1"
              appearance={{
                variables: { colorPrimary: "#059669", colorBackground: "#ffffff", borderRadius: "0.75rem" },
                elements: {
                  rootBox: "w-full",
                  cardBox: "w-full shadow-none",
                  card: "w-full border border-[#e2e8e5] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
                  headerTitle: "text-[#0f172a]",
                  headerSubtitle: "text-[#64748b]",
                  formFieldLabel: "text-[#334155]",
                  formFieldInput: "border-[#dfe7e2] bg-white text-[#0f172a] shadow-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/15",
                  formButtonPrimary: "bg-[#059669] text-white shadow-none hover:bg-[#047857] focus:bg-[#047857]",
                  footerAction: "hidden",
                  identityPreviewEditButton: "text-[#059669] hover:text-[#047857]",
                  formResendCodeLink: "text-[#059669] hover:text-[#047857]",
                },
              }}
            />
          </div>
          <p className="mt-5 text-center text-xs text-[#94a3b8]">MunshiOS owner portal · Authorized access only</p>
        </div>
      </main>
    );
  }

  const owner = await getVerifiedPlatformOwnerIdentity();
  const primaryEmail = owner.emailAddresses.find((entry) => entry.id === owner.primaryEmailAddressId)?.emailAddress ?? owner.emailAddresses[0]?.emailAddress ?? "Platform owner";
  const errorMessage = params.error === "invalid" ? "The password is incorrect." : params.error === "missing" ? "Enter your password." : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-[#fafaf8] px-4 py-10 text-[#0f172a]">
      <div className="w-full max-w-md">
        <BrandHeader />
        <div className="rounded-2xl border border-[#e2e8e5] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-7">
          <div className="mb-5">
            <p className="text-sm font-semibold text-slate-900">Confirm your password</p>
            <p className="mt-1 text-sm text-slate-500">Admin access always requires a fresh password check, even when you are already signed in.</p>
          </div>
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">{primaryEmail}</div>
          <form action={verifyPlatformPassword} className="space-y-4">
            <div>
              <label htmlFor="platform-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <input id="platform-password" name="password" type="password" autoComplete="current-password" required autoFocus className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" />
              <div className="mt-2 text-right">
                <Link href="/forgot-password" className="text-xs font-medium text-[#059669] hover:text-[#047857]">Forgot password?</Link>
              </div>
            </div>
            {errorMessage && <p role="alert" className="text-sm font-medium text-red-600">{errorMessage}</p>}
            <button type="submit" className="h-11 w-full rounded-xl bg-[#059669] text-sm font-semibold text-white transition hover:bg-[#047857]">Verify password and open admin</button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-400">This verification expires after 10 minutes.</p>
        </div>
      </div>
    </main>
  );
}
