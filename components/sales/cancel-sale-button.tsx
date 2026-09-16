"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function CancelSaleButton({ saleId, orderNumber }: { saleId: string; orderNumber: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/sales/${saleId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reverseInitialPayment: true }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error?.message ?? "Cancellation failed."); return; }
      setOpen(false);
      router.refresh();
    } catch {
      setError("The cancellation result is unknown. Refresh this sale before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>Cancel & Reverse</SheetTrigger>
    <SheetContent side="right" className="w-full sm:max-w-md">
      <SheetHeader className="border-b"><SheetTitle>Cancel and reverse {orderNumber}?</SheetTitle><SheetDescription>This is a controlled accounting reversal, not a simple delete.</SheetDescription></SheetHeader>
      <div className="space-y-4 px-4"><div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p className="text-xs leading-relaxed">Stock will be restored and the customer ledger, invoice, General Ledger, and initial sale payment will be reversed together. Cancellation is blocked when a later payment, customer credit, or return exists.</p></div>{error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}</div>
      <SheetFooter className="border-t"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep Sale</Button><Button type="button" variant="destructive" onClick={cancel} disabled={busy}>{busy ? "Reversing..." : "Confirm Cancel & Reverse"}</Button></SheetFooter>
    </SheetContent>
  </Sheet>;
}