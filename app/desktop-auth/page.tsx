"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export default function DesktopAuthPage() {
  const router = useRouter();

  const handleSignIn = () => {
    console.log("[desktop-auth] sign-in button clicked");
    if (window.businessOSDesktop?.startAuth) {
      console.log("[desktop-auth] using IPC bridge");
      window.businessOSDesktop.startAuth();
    } else {
      console.log("[desktop-auth] IPC bridge not available, falling back to window.location.href");
      router.push("/desktop-auth/start");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-2xl shadow-black/20">
          <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={80} height={80} priority className="size-full" />
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-[-0.03em] text-white">MunshiOS</h1>
        <p className="mb-8 text-slate-400">Your business, organized in one system.</p>
        <button
          onClick={handleSignIn}
          className="inline-block cursor-pointer rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
        >
          Sign in to MunshiOS
        </button>
        <p className="mt-6 text-xs text-slate-500">Opens your default browser for secure authentication</p>
      </div>
    </main>
  );
}
