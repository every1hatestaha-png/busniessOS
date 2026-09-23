"use client";

import Link from "next/link";
import { useState } from "react";

import { PrintButton } from "@/components/invoices/print-button";
import { Input } from "@/components/ui/input";

export function ChequePrintSheet({
  voucherId,
  payeeName,
  amount,
  amountWords,
  chequeDate,
  voucherNumber,
  chequeNumber,
  bankName,
  accountTitle,
}: {
  voucherId: string;
  payeeName: string;
  amount: number;
  amountWords: string;
  chequeDate: string;
  voucherNumber: string;
  chequeNumber?: string | null;
  bankName?: string | null;
  accountTitle?: string | null;
}) {
  const [payee, setPayee] = useState(payeeName);
  const [crossing, setCrossing] = useState<"ACCOUNT_PAYEE" | "BEARER">("ACCOUNT_PAYEE");
  const [printReference, setPrintReference] = useState(false);
  const numericAmount = amount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const reference = [voucherNumber, chequeNumber ? `Cheque ${chequeNumber}` : null].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-sm text-neutral-500">Professional cheque print</p>
          <h1 className="text-xl font-bold">{bankName || "Bank cheque"}</h1>
          <p className="text-xs text-neutral-500">{accountTitle || "Selected bank account"} · voucher {voucherNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/accounting/payment-vouchers/${voucherId}`} className="inline-flex h-9 items-center rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium hover:bg-neutral-50">Back to voucher</Link>
          <PrintButton label="Print cheque" />
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 print:hidden md:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-neutral-500 md:col-span-2">
          Payee name
          <Input value={payee} maxLength={120} onChange={(event) => setPayee(event.target.value)} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-neutral-500">
          Cheque type
          <select value={crossing} onChange={(event) => setCrossing(event.target.value as "ACCOUNT_PAYEE" | "BEARER")} className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200">
            <option value="ACCOUNT_PAYEE">A/C Payee Only</option>
            <option value="BEARER">Bearer</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 md:col-span-3">
          <input type="checkbox" checked={printReference} onChange={(event) => setPrintReference(event.target.checked)} />
          Print voucher / cheque reference in the memo area
        </label>
        <p className="text-xs text-neutral-500 md:col-span-3">Use 100% print scale. This sheet is sized for a standard 190 × 90 mm cheque; exact bank stationery can differ slightly, so run one alignment test on plain paper before printing a live cheque.</p>
      </div>

      <article data-print-surface data-cheque-print className="relative mx-auto h-[90mm] w-[190mm] overflow-hidden border border-dashed border-neutral-300 bg-white text-neutral-950 shadow-sm print:border-0 print:shadow-none">
        {crossing === "ACCOUNT_PAYEE" && (
          <div className="absolute left-[10mm] top-[8mm] -rotate-6 border-y-2 border-black px-[3mm] py-[1mm] text-[10pt] font-bold uppercase tracking-[0.08em]">
            A/C Payee Only
          </div>
        )}

        <div className="absolute right-[9mm] top-[8mm] font-mono text-[11pt] font-semibold tracking-[0.22em]">{chequeDate}</div>

        <div className="absolute left-[26mm] top-[29mm] w-[106mm] overflow-hidden whitespace-nowrap text-[12pt] font-semibold">
          ** {payee.trim() || payeeName} **
        </div>

        <div className="absolute right-[8mm] top-[28mm] w-[45mm] text-right font-mono text-[12pt] font-bold tabular-nums">
          *** {numericAmount} ***
        </div>

        <div className="absolute left-[26mm] top-[43mm] w-[154mm] text-[10.5pt] font-semibold leading-[1.55]">
          ** {amountWords} **
        </div>

        {crossing === "BEARER" && <div className="absolute right-[12mm] top-[20mm] text-[9pt] font-semibold uppercase tracking-wide">Bearer</div>}

        {printReference && <div className="absolute bottom-[6mm] left-[10mm] max-w-[118mm] truncate font-mono text-[7.5pt] text-neutral-700">Ref: {reference}</div>}
      </article>
    </div>
  );
}
