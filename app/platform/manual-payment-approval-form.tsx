"use client";

import { useActionState } from "react";
import { approveManualPaymentAction, type ManualPaymentState } from "@/app/platform/actions";

const initialState: ManualPaymentState = {};

export function ManualPaymentApprovalForm() {
  const [state, action, pending] = useActionState(approveManualPaymentAction, initialState);

  return (
    <section id="prepaid-onboarding" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Verified payment · New customer</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        A new customer cannot create a workspace until a paid approval is recorded. Confirm the
        credited amount and transaction ID directly with your bank or payment provider before using
        this form. Screenshots and customer claims are not payment verification.
      </p>
      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-700">
          Registered customer email
          <input name="customerEmail" type="email" required maxLength={254}
            placeholder="customer@example.com"
            className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Credited payment amount (PKR)
          <input name="verifiedAmountPkr" type="number" min={34000} step="1" defaultValue={34000}
            required className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Bank-verified unique reference
          <input name="paymentReference" type="text" minLength={8} maxLength={128}
            required placeholder="Bank reference ID"
            className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal" />
        </label>
        <div className="sm:col-span-3">
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input type="checkbox" name="bankVerified" value="yes" required className="mt-0.5" />
            I checked the actual credited transaction in the bank/payment provider, not a screenshot.
          </label>
        </div>
        {state.message && (
          <p role={state.status === "success" ? "status" : "alert"} className="text-sm sm:col-span-3">
            {state.message}
          </p>
        )}
        <button type="submit" disabled={pending}
          className="min-h-11 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-3 sm:justify-self-start">
          {pending ? "Recording verified payment…" : "Approve one paid workspace"}
        </button>
      </form>
      <p className="mt-4 text-xs text-slate-500">Current published starting amount: PKR 29,000 implementation + PKR 5,000 first month. One approval provisions one workspace for 30 days. Online gateway checkout is not connected yet.</p>
    </section>
  );
}
