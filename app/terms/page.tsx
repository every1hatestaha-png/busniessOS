import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f8faf9] px-5 py-12 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-emerald-700">Back to MunshiOS</Link>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Terms</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated September 19, 2026</p>
          <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
            <section><h2 className="text-lg font-semibold text-slate-950">Using MunshiOS</h2><p className="mt-2">You may use MunshiOS for lawful business purposes and must provide accurate account information. You are responsible for activity performed through your account and workspace members you authorize.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Business records</h2><p className="mt-2">MunshiOS helps record and organize business activity. You remain responsible for reviewing entries, tax treatment, filings, statutory records, and professional advice required for your business.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Subscriptions and billing</h2><p className="mt-2">Pricing, billing frequency, renewal terms, included modules, trial terms, and cancellation options will be shown before a paid subscription is activated. Charges should only begin after the applicable checkout flow is completed.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Acceptable use</h2><p className="mt-2">You must not misuse the service, attempt unauthorized access, interfere with other customers, upload unlawful material, abuse integrations, or use MunshiOS to facilitate fraud or harmful activity.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Availability and changes</h2><p className="mt-2">We may improve, modify, add, or retire features as the product develops. We aim to protect data integrity and provide reasonable notice when a material change affects normal paid use.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Account suspension</h2><p className="mt-2">Access may be restricted for security incidents, abuse, non-payment, legal requirements, or serious violations of these terms. Where appropriate, we may provide a path to resolve the issue.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Intellectual property</h2><p className="mt-2">MunshiOS software, branding, design, and original product materials remain the property of their respective owners. You retain ownership of business information you enter, subject to the rights needed to operate the service.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Updates to these terms</h2><p className="mt-2">We may update these terms as the service changes. The current version will be published here with the latest revision date.</p></section>
          </div>
        </div>
      </div>
    </main>
  );
}
