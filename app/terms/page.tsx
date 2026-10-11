import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing business use of MunshiOS.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f8faf9] px-5 py-12 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-[#087C72]">Back to MunshiOS</Link>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087C72]">Terms</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated October 7, 2026</p>

          <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
            <section>
              <h2 className="text-lg font-semibold text-slate-950">Using MunshiOS</h2>
              <p className="mt-2">MunshiOS is intended for lawful business use by people authorized to act for the relevant business. You must provide accurate account information, protect your credentials and devices, and are responsible for the workspace members and permissions you authorize.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Business and tax responsibility</h2>
              <p className="mt-2">MunshiOS helps record, organize and transmit business information. Your business remains responsible for the accuracy of entries, tax treatment, registrations, statutory records, filing deadlines, approvals and professional advice required for its activities.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">FBR and connected services</h2>
              <p className="mt-2">Digital invoicing and other integrations depend on external systems such as FBR, PRAL, licensed integrators, banks or communications providers. Their availability, credentials, validation rules and legal requirements are outside MunshiOS control. MunshiOS may block, queue or reject an operation rather than bypass a required validation or security control.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Pricing and activation</h2>
              <p className="mt-2">The standard public price is PKR 29,000 for one-time implementation and PKR 5,000 per month, unless a written quotation or agreement states otherwise. The implementation scope, included modules, payment timing and any trial or promotional period should be confirmed before paid activation.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Cancellation and refunds</h2>
              <p className="mt-2">Cancellation stops future paid periods after the applicable notice or billing arrangement. It does not automatically delete operational records. Refund handling is described in the <Link href="/refund-policy" className="font-medium text-[#087C72] underline underline-offset-4">Refund & Cancellation Policy</Link>, subject to any written commercial agreement and applicable law.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Acceptable use</h2>
              <p className="mt-2">You must not attempt unauthorized access, interfere with other customers, upload unlawful or malicious material, abuse integrations, submit fraudulent records, evade required tax controls, infringe intellectual property, probe the service without authorization, or use MunshiOS to facilitate harmful or illegal activity.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Data ownership and permitted processing</h2>
              <p className="mt-2">Your business retains ownership of the business information it enters, subject to the rights reasonably needed for MunshiOS and its service providers to host, process, secure, back up and transmit that information to provide the service. Our handling of information is described in the <Link href="/privacy" className="font-medium text-[#087C72] underline underline-offset-4">Privacy Policy</Link>.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Record integrity</h2>
              <p className="mt-2">Posted accounting, audit and compliance records may be corrected through cancellation, reversal, credit note, debit note, void or other non-destructive workflows instead of deletion where preserving history is appropriate or required.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Availability, maintenance and changes</h2>
              <p className="mt-2">We aim to provide reliable service but do not promise uninterrupted availability. Maintenance, security work, provider outages, internet failures and external integrations may affect availability. We may improve, modify or retire features while aiming to protect customer data and provide reasonable notice for material changes to normal paid use.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Suspension and termination</h2>
              <p className="mt-2">Access may be restricted for security incidents, abuse, non-payment, legal requirements, suspected fraud or serious violations of these terms. Where appropriate, we may provide a reasonable opportunity to resolve the issue. Termination does not erase obligations or records that must reasonably be retained.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Warranties and liability</h2>
              <p className="mt-2">MunshiOS is provided as business software and does not replace professional accounting, tax, legal or regulatory advice. To the maximum extent permitted by applicable law, neither party should be liable for indirect or consequential losses that were not reasonably foreseeable. Any signed commercial agreement may set more specific service levels, warranties or liability limits and will control where it conflicts with these public terms.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Intellectual property</h2>
              <p className="mt-2">MunshiOS software, branding, design and original product materials remain the property of their respective owners. These terms do not transfer ownership of the platform or its underlying intellectual property.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Applicable law and updates</h2>
              <p className="mt-2">These terms are intended to operate under applicable law in Pakistan, subject to any written agreement between MunshiOS and the customer. We may update these terms as the service, law or compliance requirements change. The current version will be published here with its revision date.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
