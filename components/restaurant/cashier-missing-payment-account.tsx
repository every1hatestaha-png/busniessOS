import Link from "next/link";
import { AlertCircle } from "lucide-react";

/**
 * Only managers have access to Cash & Bank setup. Cashiers should never be
 * directed to a forbidden accounting route during a busy service shift.
 */
export function CashierMissingPaymentAccount({ canConfigure }: { canConfigure: boolean }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">Payment collection unavailable</p>
        <p className="mt-1">
          An active cash or bank account is required before a payment can be recorded.
          {canConfigure ? " Set one up in Cash & Bank." : " Ask your Manager to configure a payment account."}
        </p>
        {canConfigure ? (
          <Link href="/accounting/cash-bank" className="mt-2 inline-flex min-h-10 items-center font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">
            Open Cash & Bank setup
          </Link>
        ) : null}
      </div>
    </div>
  );
}
