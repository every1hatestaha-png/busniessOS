import { SignIn } from "@clerk/nextjs";

export default function PlatformSignInPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#06131a] px-4 py-10 text-white">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">MunshiOS Control Plane</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Owner sign in</h1>
          <p className="mt-2 text-sm text-slate-400">Platform administration only</p>
        </div>
        <SignIn
          routing="path"
          path="/platform/sign-in"
          forceRedirectUrl="/platform"
          signUpUrl="/sign-up"
        />
      </div>
    </main>
  );
}
