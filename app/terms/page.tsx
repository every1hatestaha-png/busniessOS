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
            <section><h2 className="text-lg font-semibold text-slate-950">Using MunshiOS</h2><p className="mt-2">MunshiOS is intended for lawful business use by people authorized to act for the relevant business. You must provide accurate account information and are responsible for activity performed through your account and for workspace members you authorize.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Business and tax records</h2><p className="mt-2">MunshiOS helps record, organize and transmit business information. You remain responsible for the accuracy and completeness of entries, tax treatment, registrations, statutory records, filing deadlines and professional advice required for your business.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">FBR Digital Invoicing</h2><p className="mt-2">FBR Digital Invoicing features are designed to support the applicable electronic invoicing workflow, but they do not replace the Sales Tax Act, Sales Tax Rules, FBR notifications or professional tax advice. Where FBR requires integration through a licensed integrator, production transmission must use a valid licensed-integrator or PRAL route. MunshiOS must not be represented as an FBR-licensed integrator unless a valid license has actually been granted.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Authorization to transmit compliance data</h2><p className="mt-2">By enabling a production tax integration, an authorized workspace user confirms that the business is entitled to submit the relevant information and authorizes MunshiOS to process and transmit the required invoice and tax data through the configured compliance route. Users must not submit false, misleading or unauthorized tax information.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">External systems</h2><p className="mt-2">FBR, PRAL, licensed integrators, banks, payment providers and other third-party systems are outside MunshiOS control. Their availability, credentials, validation rules and legal requirements may change. MunshiOS may block, queue or reject a transmission rather than silently bypass a required validation or legal control.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Subscriptions and billing</h2><p className="mt-2">Pricing, billing frequency, renewal terms, included modules, trial terms and cancellation options will be shown before a paid subscription is activated. Charges should only begin after the applicable checkout or activation flow is completed.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Acceptable use</h2><p className="mt-2">You must not misuse the service, attempt unauthorized access, interfere with other customers, upload unlawful material, abuse integrations, submit fraudulent records, evade required tax controls, infringe intellectual property, or use MunshiOS to facilitate harmful activity.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Record integrity</h2><p className="mt-2">Posted accounting, audit and compliance records may be corrected through cancellation, reversal, credit note, debit note, void or other non-destructive workflows instead of deletion where preserving history is appropriate or legally required.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Availability and changes</h2><p className="mt-2">We may improve, modify, add or retire features as the product, law and connected services evolve. We aim to protect data integrity and provide reasonable notice when a material change affects normal paid use.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Account suspension</h2><p className="mt-2">Access may be restricted for security incidents, abuse, non-payment, legal requirements, suspected fraud, or serious violations of these terms. Where appropriate, we may provide a path to resolve the issue.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Intellectual property</h2><p className="mt-2">MunshiOS software, branding, design and original product materials remain the property of their respective owners. You retain ownership of business information you enter, subject to the rights reasonably needed to operate, secure and lawfully provide the service.</p></section>
            <section><h2 className="text-lg font-semibold text-slate-950">Updates to these terms</h2><p className="mt-2">We may update these terms as the service, applicable law or compliance requirements change. The current version will be published here with the latest revision date.</p></section>
          </div>
        </div>
      </div>
    </main>
  );
}
