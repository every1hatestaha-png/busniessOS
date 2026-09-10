"use client";

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
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-4">
          MunshiOS
        </h1>
        <p className="text-slate-400 mb-8">
          Sign in to continue
        </p>
        <button
          onClick={handleSignIn}
          className="inline-block rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors cursor-pointer"
        >
          Sign in with MunshiOS
        </button>
        <p className="mt-6 text-xs text-slate-500">
          Opens your default browser for secure authentication
        </p>
      </div>
    </main>
  );
}
