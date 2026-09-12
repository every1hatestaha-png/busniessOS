import Image from "next/image";
import { SignIn } from "@clerk/nextjs";

export default function PlatformSignInPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#fafaf8] px-4 py-10 text-[#0f172a]">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
            <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={38} height={38} priority />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#059669]">MunshiOS Control Plane</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0f172a]">Owner sign in</h1>
          <p className="mt-2 text-sm text-[#64748b]">Secure access to platform administration</p>
        </div>

        <div className="flex justify-center">
          <SignIn
            routing="path"
            path="/platform/sign-in"
            forceRedirectUrl="/platform"
            signUpUrl="/sign-up"
            appearance={{
              variables: {
                colorPrimary: "#059669",
                colorBackground: "#ffffff",
                borderRadius: "0.75rem",
              },
              elements: {
                rootBox: "w-full",
                cardBox: "w-full shadow-none",
                card: "w-full border border-[#e2e8e5] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
                headerTitle: "text-[#0f172a]",
                headerSubtitle: "text-[#64748b]",
                formFieldLabel: "text-[#334155]",
                formFieldInput: "border-[#dfe7e2] bg-white text-[#0f172a] shadow-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/15",
                formButtonPrimary: "bg-[#059669] text-white shadow-none hover:bg-[#047857] focus:bg-[#047857]",
                footerActionLink: "text-[#059669] hover:text-[#047857]",
                identityPreviewEditButton: "text-[#059669] hover:text-[#047857]",
                formResendCodeLink: "text-[#059669] hover:text-[#047857]",
              },
            }}
          />
        </div>

        <p className="mt-5 text-center text-xs text-[#94a3b8]">MunshiOS owner portal • Authorized access only</p>
      </div>
    </main>
  );
}
