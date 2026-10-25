"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { useRestaurantActionState } from "@/app/(dashboard)/restaurant/use-restaurant-action-state";
import { initialRestaurantV1ActionState } from "@/app/(dashboard)/restaurant/v1-action-state";
import { recordRestaurantPaymentAction } from "@/app/(dashboard)/restaurant/v1-actions";
import { Button } from "@/components/ui/button";
import { eligibleCashierSettlementAccounts } from "@/lib/restaurant/cashier-settlement";
import { cashierPaymentSignature } from "@/lib/restaurant/cashier-payment-retry";

export type CashierSettlementAccount = {
  cashBankAccountId: string;
  name: string;
  isBank: boolean;
};

const paymentMethods = [
  { value: "CASH", label: "Cash" },
  { value: "CREDIT_CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "JAZZCASH", label: "JazzCash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "MOBILE_WALLET", label: "Mobile wallet" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
] as const;

type PaymentMethod = (typeof paymentMethods)[number]["value"];

export function CashierPaymentForm({
  workspaceId,
  orderId,
  paymentRequestId,
  outstanding,
  accounts,
}: {
  workspaceId: string;
  orderId: string;
  paymentRequestId: string;
  outstanding: number;
  accounts: CashierSettlementAccount[];
}) {
  const [method, setMethod] = useState<PaymentMethod>(
    accounts.some(account => !account.isBank) ? "CASH" : "BANK_TRANSFER",
  );
  const [submitted, setSubmitted] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState("");
  const [receiptReady, setReceiptReady] = useState(false);
  const requestId = useRef(paymentRequestId);
  const requestField = useRef<HTMLInputElement>(null);
  const attemptedSignature = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const eligibleAccounts = useMemo(
    () => eligibleCashierSettlementAccounts(accounts, method),
    [accounts, method],
  );

  const [state, action, pending, preventDoubleSubmit] = useRestaurantActionState(
    async (_previous, form) => {
      const result = await recordRestaurantPaymentAction(form);
      if (result.status === "success") {
        // A successful receipt is immutable evidence. The next collection must
        // always have a different idempotency identity, even for partial payments.
        requestId.current = `rp:${crypto.randomUUID()}`;
        if (requestField.current) requestField.current.value = requestId.current;
        attemptedSignature.current = null;
        setSubmitted(false);
        setSafetyMessage("");
        setReceiptReady(true);
        formRef.current?.reset();
      } else {
        setSafetyMessage("If a payment may have reached the server, check this order's receipt before retrying. An unchanged retry keeps the same request ID.");
      }
      return result;
    },
    initialRestaurantV1ActionState,
  );

  function beginChangedPayment() {
    // Require an explicit operator action for a changed amount/method/account
    // after an ambiguous failure. The original identity is not re-used.
    requestId.current = `rp:${crypto.randomUUID()}`;
    if (requestField.current) requestField.current.value = requestId.current;
    attemptedSignature.current = null;
    setSubmitted(false);
    setSafetyMessage("");
    setReceiptReady(false);
  }

  return (
    <form
      ref={formRef}
      action={action}
      aria-busy={pending}
      onSubmit={(event) => {
        const signature = cashierPaymentSignature(new FormData(event.currentTarget));
        if (attemptedSignature.current && attemptedSignature.current !== signature) {
          event.preventDefault();
          setSafetyMessage("This payment changed after an attempted submission. Check the receipt first; then explicitly start a new payment attempt.");
          return;
        }
        preventDoubleSubmit(event);
        if (!event.defaultPrevented) {
          attemptedSignature.current ??= signature;
          setSubmitted(true);
          setSafetyMessage("");
          setReceiptReady(false);
          if (requestField.current) requestField.current.value = requestId.current;
        }
      }}
      className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2"
    >
      <input type="hidden" name="formWorkspaceId" value={workspaceId} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="paymentRequestId" ref={requestField} defaultValue={paymentRequestId} />
      <fieldset disabled={pending} className="contents">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          Payment method
          <select name="method" value={method} onChange={event => setMethod(event.target.value as PaymentMethod)}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal">
            {paymentMethods.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          Settlement account
          <select key={method} name="cashBankAccountId" required
            defaultValue={eligibleAccounts[0]?.cashBankAccountId ?? ""}
            disabled={eligibleAccounts.length === 0}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal">
            {eligibleAccounts.length === 0 && <option value="">No compatible account</option>}
            {eligibleAccounts.map(account =>
              <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          Amount (PKR)
          <input name="amount" type="number" min="0.01" max={outstanding} step="0.01"
            defaultValue={outstanding} required
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          Transaction reference (optional)
          <input name="reference" maxLength={120} placeholder="Receipt or bank reference"
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal" />
        </label>
        {method === "CASH" && (
          <p className="text-xs text-slate-500 sm:col-span-2">Cash receipts require an open restaurant cash shift. The server verifies the shift at payment time.</p>
        )}
        {!eligibleAccounts.length && (
          <p role="alert" className="text-xs text-amber-800 sm:col-span-2">
            No {method === "CASH" ? "physical cash" : "bank or digital settlement"} account is configured. Ask a manager to add one.
          </p>
        )}
        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-red-700 sm:col-span-2" : "text-xs font-medium text-emerald-700 sm:col-span-2"}>
            {state.message}
          </p>
        )}
        {receiptReady && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950 sm:col-span-2">
            <span>Payment recorded and posted.</span>
            <Link href={`/restaurant/orders/${orderId}/print`} className="font-semibold underline">
              Review / print updated receipt
            </Link>
          </div>
        )}
        {safetyMessage && (
          <div role="alert" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 sm:col-span-2">
            <p>{safetyMessage}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/restaurant/orders/${orderId}/print`} className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold">
                Check current receipt
              </Link>
              {submitted && (
                <Button type="button" variant="outline" size="sm" onClick={beginChangedPayment}>
                  Start changed payment attempt
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="flex justify-end sm:col-span-2">
          <Button size="sm" type="submit" disabled={!eligibleAccounts.length || pending || outstanding <= 0}
            className="min-h-10 rounded-lg bg-emerald-700 hover:bg-emerald-800">
            {pending ? "Recording payment…" : "Record verified payment"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
