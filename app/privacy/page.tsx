import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How MunshiOS collects, uses, protects, retains and shares account and business information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f8faf9] px-5 py-12 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-[#087C72]">Back to MunshiOS</Link>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087C72]">Privacy</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated October 7, 2026</p>

          <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
            <section>
              <h2 className="text-lg font-semibold text-slate-950">Scope and roles</h2>
              <p className="mt-2">MunshiOS is business software for authorized users of a business workspace. For account, security, billing and service-operation data, MunshiOS determines the purposes needed to operate the service. For customer, supplier, employee, invoice, inventory and other business records entered by a workspace, the relevant business generally determines why that information is entered and who is permitted to use it.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Information we process</h2>
              <p className="mt-2">We may process account identity and contact details, workspace and membership information, authentication and security events, customer and supplier records, tax identifiers, invoices, payments, inventory, purchasing, sales, restaurant or manufacturing records, device and diagnostic information, support communications, and other information authorized users choose to enter.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">How information is used</h2>
              <p className="mt-2">Information is used to authenticate users, provide workspace features, preserve accounting and audit integrity, secure the service, prevent abuse, support users, diagnose failures, maintain backups, improve reliability, administer subscriptions, and meet contractual, tax, legal or compliance obligations.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Authentication and essential cookies</h2>
              <p className="mt-2">MunshiOS uses authentication and workspace cookies that are necessary to keep users signed in, protect sessions and remember the active workspace. We do not use these essential cookies for third-party advertising. More detail is available in our <Link href="/cookies" className="font-medium text-[#087C72] underline underline-offset-4">Cookie Policy</Link>.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">FBR Digital Invoicing</h2>
              <p className="mt-2">When an authorized workspace enables an FBR Digital Invoicing workflow, MunshiOS may prepare and transmit required seller, buyer, invoice, tax and product information through the configured FBR, PRAL or licensed-integrator route. MunshiOS does not claim to be an FBR-licensed integrator unless a valid license is separately obtained and disclosed.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Service providers and international processing</h2>
              <p className="mt-2">We may use hosting, authentication, database, email, infrastructure, monitoring, communications, payment and support providers. Those providers may process information outside Pakistan. Access is limited to what is reasonably needed for the service, and we expect providers to maintain appropriate security and contractual safeguards.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">No sale of business records</h2>
              <p className="mt-2">MunshiOS does not sell workspace records, invoice data, tax identifiers, customer lists or supplier data to advertisers or data brokers.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Analytics and session recording</h2>
              <p className="mt-2">MunshiOS does not currently use session-replay tooling to record keystrokes or authenticated business screens. If non-essential analytics, advertising cookies or session replay are introduced later, this policy and any required notice or consent controls should be updated before they are enabled.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Retention, backups and deletion</h2>
              <p className="mt-2">We retain information while needed to provide the service and for reasonable periods required for security, backups, accounting integrity, tax records, dispute handling and legal obligations. Posted financial, audit, tax and FBR transmission records may need to remain in a non-destructive history even when an account is closed. Other information may be removed or anonymized when it is no longer reasonably needed.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Workspace access and your choices</h2>
              <p className="mt-2">Workspace owners and administrators control who they invite and which roles they grant. Authorized users can update many records from the product and may request account, access, correction or deletion assistance through the support channel provided in the product or commercial relationship. Requests may be limited where retention is necessary for security, fraud prevention, accounting integrity, tax or another lawful obligation.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Security and incident response</h2>
              <p className="mt-2">MunshiOS uses authenticated sessions, role-aware access, workspace scoping, transport encryption, auditability and server-side business rules designed to reduce unauthorized access, alteration or disclosure. We investigate credible security incidents and take containment, remediation and notification steps appropriate to the facts and applicable obligations. No online service can guarantee absolute security.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Children</h2>
              <p className="mt-2">MunshiOS is intended for business users and is not directed to children. Users should not create accounts for children or enter child data unless it is genuinely required for a lawful business purpose and the business has the authority to do so.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Policy changes</h2>
              <p className="mt-2">We may update this policy as the product, providers, law or compliance requirements evolve. Material changes will be reflected here with a new revision date and, where appropriate, additional notice.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
