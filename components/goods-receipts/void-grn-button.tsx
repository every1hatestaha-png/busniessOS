"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function VoidGrnButton({ grnId, grnNumber, disabled }: { grnId: string; grnNumber: string; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleVoid() {
    if (!reason.trim()) { setMessage("A void reason is required."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/goods-receipts/${grnId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voidedReason: reason.trim() }) });
      const body = await response.json();
      if (!response.ok) { setMessage(body.error?.message ?? "GRN could not be voided."); return; }
      setOpen(false); router.refresh();
    } catch { setMessage("Network error. Please try again."); }
    finally { setBusy(false); }
  }

  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button type="button" variant="destructive" size="sm" disabled={disabled} />}><Ban />Void GRN</SheetTrigger><SheetContent side="right" className="w-full sm:max-w-md"><SheetHeader className="border-b"><SheetTitle>Void {grnNumber}?</SheetTitle><SheetDescription>The receipt remains in the audit trail with a voided status.</SheetDescription></SheetHeader><div className="space-y-4 px-4"><div className="flex gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p className="text-xs leading-relaxed">Voiding reverses accepted inventory, supplier payable, PO receiving, and General Ledger effects. Supplier returns, payments, or insufficient stock may block the reversal.</p></div><label className="block"><span className="mb-1 block text-xs font-medium text-slate-700">Void reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} rows={4} placeholder="Explain why this receipt must be voided" className="w-full rounded-md border px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>{message && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{message}</p>}</div><SheetFooter className="border-t"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep Receipt</Button><Button type="button" variant="destructive" onClick={handleVoid} disabled={busy || !reason.trim()}>{busy ? "Voiding..." : "Void & Reverse"}</Button></SheetFooter></SheetContent></Sheet>;
}
