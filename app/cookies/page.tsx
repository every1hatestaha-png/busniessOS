import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How MunshiOS uses essential cookies and similar browser storage.",
  alternates: { canonical: "/cookies" },
};

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-[#f8faf9] px-5 py-12 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-[#087C72]">Back to MunshiOS</Link>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087C72]">Legal</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Cookie Policy</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated October 7, 2026</p>

          <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
            <section>
              <h2 className="text-lg font-semibold text-slate-950">What MunshiOS uses</h2>
              <p className="mt-2">MunshiOS uses cookies and similar browser storage that are necessary to authenticate users, maintain secure sessions, remember the active workspace, prevent abuse and keep the application functioning correctly.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Essential authentication cookies</h2>
              <p className="mt-2">Authentication cookies allow the browser to remain signed in and let the server verify the current session. Disabling or deleting these cookies may sign you out or prevent protected workspace features from working.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Workspace preference</h2>
              <p className="mt-2">MunshiOS may store the identifier of the active workspace so a signed-in user returns to the correct business context. Server-side authorization still verifies that the user is actually a member of that workspace before data is returned.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Advertising and session replay</h2>
              <p className="mt-2">MunshiOS does not currently use third-party advertising cookies or session-replay tools to record authenticated business screens. If non-essential tracking is introduced later, this policy and any required notice or consent controls should be updated before it is enabled.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Managing cookies</h2>
              <p className="mt-2">You can remove or block cookies through your browser settings. Because current MunshiOS cookies are used for authentication and core application behavior, blocking them can prevent login, workspace switching or other protected features from working properly.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">More information</h2>
              <p className="mt-2">See the <Link href="/privacy" className="font-medium text-[#087C72] underline underline-offset-4">Privacy Policy</Link> for information about data handling and retention.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
