import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f8faf9] px-5 py-12 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-emerald-700">Back to MunshiOS</Link>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Privacy</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated September 19, 2026</p>
          <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
            <section><h2 className="text-lg font-semibold text-slate-950">What we collect</h2><p className="mt-2">MunshiOS may collect account details, business profile information, workspace records, usage information, device and diagnostic data, and information you choose to enter into the service.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">How we use information</h2><p className="mt-2">We use information to provide the service, secure accounts, operate business features, support users, improve reliability, prevent abuse, and meet legal or compliance obligations.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Workspace separation</h2><p className="mt-2">Business records are scoped to a workspace and access is controlled through authenticated users and permissions. Users should only add people they trust to their workspace.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Service providers</h2><p className="mt-2">MunshiOS may use infrastructure, authentication, database, hosting, analytics, communications, payment, and support providers. We share information only as needed to operate those services.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Retention and deletion</h2><p className="mt-2">We retain information while an account or workspace is active and as needed for security, accounting integrity, dispute handling, backups, or legal requirements. Some financial records may need to remain in history rather than being permanently removed.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Your choices</h2><p className="mt-2">You can update many business details from the product. You may also request account assistance or data-related support through the support channels shown on the MunshiOS website.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Security</h2><p className="mt-2">We use authentication, access controls, workspace scoping, audit trails, and other safeguards. No online service can guarantee absolute security, so users should also protect their credentials and devices.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Changes</h2><p className="mt-2">We may update this policy as MunshiOS evolves. The latest version will be published on this page with an updated date.</p></section>
          </div>
        </div>
      </div>
    </main>
  );
}
