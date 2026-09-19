"use client";

import { useActionState } from "react";
import { CheckCircle2, Send } from "lucide-react";

import { requestActivationAction, type SubscriptionRequestState } from "@/app/subscription/actions";
import { Button } from "@/components/ui/button";

const initialState: SubscriptionRequestState = {};

export function SubscriptionRequestForm({ currentPlan }: { currentPlan: string | null }) {
  const [state, formAction, pending] = useActionState(requestActivationAction, initialState);

  return (
    <form action={formAction} className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
      <div>
        <h3 className="font-semibold text-slate-950">Upgrade or renew</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">Choose what you want. Your request goes directly to the MunshiOS owner console for activation. Online payment will plug into this same flow when the payment gateway is enabled.</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Plan</span>
          <select name="planCode" defaultValue={currentPlan || "starter"} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="starter">Starter</option>
            <option value="business">Business</option>
            <option value="pro">Pro</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Billing</span>
          <select name="billing" defaultValue="monthly" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-5 text-sm">
          {state.status === "success" && <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="size-4" />{state.message}</span>}
          {state.status === "error" && <span className="text-red-600" role="alert">{state.message}</span>}
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Sending..." : <><Send className="size-4" />Request activation</>}</Button>
      </div>
    </form>
  );
}
