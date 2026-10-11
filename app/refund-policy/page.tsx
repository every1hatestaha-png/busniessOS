import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "MunshiOS implementation, monthly service, cancellation and refund policy.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-[#f8faf9] px-5 py-12 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-[#087C72]">Back to MunshiOS</Link>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087C72]">Billing</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Refund & Cancellation Policy</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated October 7, 2026</p>

          <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
            <section>
              <h2 className="text-lg font-semibold text-slate-950">Standard pricing</h2>
              <p className="mt-2">Unless a written quotation or agreement states otherwise, MunshiOS is offered at PKR 29,000 for one-time implementation and PKR 5,000 per month for the ongoing service.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Implementation fee</h2>
              <p className="mt-2">If implementation work has not started, a customer may request cancellation and a refund of an implementation payment that has already been collected. Once onboarding, configuration, data preparation, training or other agreed implementation work has begun, any refund will take into account work already delivered and costs reasonably incurred. A written commercial agreement may set a different implementation scope or refund rule.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Monthly service</h2>
              <p className="mt-2">A customer may request cancellation to stop future monthly service periods. Access for an already-paid period may continue until that period ends unless access must be restricted for security, abuse, non-payment or legal reasons.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Incorrect or duplicate charges</h2>
              <p className="mt-2">If MunshiOS collects an incorrect or duplicate payment, the customer should report it through the support channel used for the commercial relationship. Verified billing errors should be corrected or refunded as appropriate.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Data after cancellation</h2>
              <p className="mt-2">Cancelling paid access does not automatically delete business records. Data retention, export and deletion are handled in accordance with the <Link href="/privacy" className="font-medium text-[#087C72] underline underline-offset-4">Privacy Policy</Link>, accounting integrity requirements and any applicable commercial agreement.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Written agreements and applicable law</h2>
              <p className="mt-2">A signed quotation, order form or commercial agreement may contain different billing, cancellation or refund terms and will control where it conflicts with this public policy. Nothing in this policy limits rights that cannot lawfully be excluded.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
