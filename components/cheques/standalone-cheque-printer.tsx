"use client";

import { useMemo, useState } from "react";
import { PrintButton } from "@/components/invoices/print-button";
import { formatPkrAmountInWords } from "@/lib/amount-in-words";

export function StandaloneChequePrinter() {
  const [payee, setPayee] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [date, setDate] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [bank, setBank] = useState("");
  const [crossing, setCrossing] = useState<"ACCOUNT_PAYEE" | "BEARER">("ACCOUNT_PAYEE");
  const [showReference, setShowReference] = useState(false);
  const amount = Number(amountInput);
  const validAmount = amountInput.trim() !== "" && Number.isFinite(amount) && amount > 0 && amount <= 999999999.99 && /^\d{1,9}(?:\.\d{1,2})?$/.test(amountInput);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date + "T12:00:00").toISOString().slice(0, 10) === date;
  const ready = Boolean(payee.trim()) && validAmount && validDate;
  const amountWords = useMemo(() => validAmount ? formatPkrAmountInWords(amount) : "", [amount, validAmount]);
  const numericAmount = validAmount ? amount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  const chequeDate = validDate ? date.slice(8, 10) + date.slice(5, 7) + date.slice(0, 4) : "";

  return <div className="mx-auto max-w-[1100px] space-y-5">
    <header className="print:hidden">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Finance / Cheque Printing</p>
      <h1 className="mt-1 text-2xl font-semibold">Cheque Printing</h1>
      <p className="mt-2 text-sm text-neutral-600">Prepare a physical bank cheque without recording a payment. Nothing is saved or posted to the ledger.</p>
    </header>
    <section className="grid gap-4 rounded-xl border bg-white p-5 print:hidden sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">Payee name (required)<input className="h-10 rounded-md border px-3" value={payee} onChange={e => setPayee(e.target.value)} maxLength={120} autoComplete="off" /></label>
      <label className="grid gap-1 text-sm font-medium">Amount in PKR (required)<input className="h-10 rounded-md border px-3" value={amountInput} onChange={e => setAmountInput(e.target.value)} inputMode="decimal" placeholder="25000.00" autoComplete="off" /></label>
      <label className="grid gap-1 text-sm font-medium">Cheque date (required)<input className="h-10 rounded-md border px-3" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className="grid gap-1 text-sm font-medium">Cheque number (optional)<input className="h-10 rounded-md border px-3" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} maxLength={40} autoComplete="off" /></label>
      <label className="grid gap-1 text-sm font-medium">Bank name (optional)<input className="h-10 rounded-md border px-3" value={bank} onChange={e => setBank(e.target.value)} maxLength={80} autoComplete="off" /></label>
      <label className="grid gap-1 text-sm font-medium">Cheque type<select className="h-10 rounded-md border px-3" value={crossing} onChange={e => setCrossing(e.target.value as "ACCOUNT_PAYEE" | "BEARER")}><option value="ACCOUNT_PAYEE">A/C Payee Only</option><option value="BEARER">Bearer</option></select></label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={showReference} onChange={e => setShowReference(e.target.checked)} /> Print cheque number in memo area</label>
      <div className="sm:col-span-2">
        {!validAmount && amountInput && <p role="alert" className="mb-2 text-sm text-red-700">Enter a positive amount with up to two decimal places.</p>}
        <p className="mb-3 text-xs text-neutral-600">Print at 100% scale on 190 × 90 mm stationery. First test alignment on plain paper; bank cheque formats differ.</p>
        <button type="button" disabled={!ready} onClick={() => window.print()} className="rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Print cheque</button>
      </div>
    </section>
    {ready ? <article data-print-surface data-cheque-print className="relative mx-auto h-[90mm] w-[190mm] max-w-none overflow-hidden border border-dashed border-neutral-300 bg-white text-neutral-950 shadow-sm print:border-0 print:shadow-none">
      {crossing === "ACCOUNT_PAYEE" && <div className="absolute left-[10mm] top-[8mm] -rotate-6 border-y-2 border-black px-[3mm] py-[1mm] text-[10pt] font-bold uppercase">A/C Payee Only</div>}
      <div className="absolute right-[9mm] top-[8mm] font-mono text-[11pt] font-semibold tracking-[0.22em]">{chequeDate}</div>
      <div className="absolute left-[26mm] top-[29mm] w-[106mm] overflow-hidden whitespace-nowrap text-[12pt] font-semibold">** {payee.trim()} **</div>
      <div className="absolute right-[8mm] top-[28mm] w-[45mm] text-right font-mono text-[12pt] font-bold tabular-nums">*** {numericAmount} ***</div>
      <div className="absolute left-[26mm] top-[43mm] w-[154mm] text-[10.5pt] font-semibold leading-[1.55]">** {amountWords} **</div>
      {crossing === "BEARER" && <div className="absolute right-[12mm] top-[20mm] text-[9pt] font-semibold uppercase">Bearer</div>}
      {showReference && chequeNumber.trim() && <div className="absolute bottom-[6mm] left-[10mm] max-w-[118mm] truncate font-mono text-[7.5pt]">Cheque: {chequeNumber.trim()}</div>}
    </article> : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-neutral-500 print:hidden">Enter payee, amount and date to preview the cheque.</p>}
    {bank && <p className="text-xs text-neutral-500 print:hidden">Bank: {bank}</p>}
  </div>;
}
