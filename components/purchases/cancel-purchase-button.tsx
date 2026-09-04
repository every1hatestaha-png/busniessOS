"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function CancelPurchaseButton({ purchaseId, orderNumber, received }: { purchaseId: string; orderNumber: string; received: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function cancel() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/purchases/${purchaseId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reverseInitialPayment: received }) });
      const body = await response.json();
      if (!response.ok) { setMessage(body.error?.message ?? "Purchase could not be cancelled."); return; }
      setOpen(false); router.refresh();
    } catch { setMessage("The cancellation result is unknown. Refresh the purchase before retrying."); }
    finally { setBusy(false); }
  }
  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>Cancel PO</SheetTrigger><SheetContent side="right" className="w-full sm:max-w-md"><SheetHeader className="border-b"><SheetTitle>Cancel {orderNumber}?</SheetTitle><SheetDescription>{received ? "This purchase has receipt history and requires a full accounting reversal." : "The purchase order will be closed without creating financial entries."}</SheetDescription></SheetHeader><div className="px-4"><div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p className="text-xs leading-relaxed">{received ? "Accepted stock, supplier payable, PO receiving, active GRNs, and General Ledger effects will be reversed. Payments or supplier returns can block cancellation." : "This action cannot be undone. No inventory or payable reversal is required for an unreceived order."}</p></div>{message && <p role="alert" className="mt-3 text-xs text-red-700">{message}</p>}</div><SheetFooter className="border-t"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep Purchase</Button><Button type="button" variant="destructive" onClick={cancel} disabled={busy}>{busy ? "Cancelling..." : "Confirm Cancellation"}</Button></SheetFooter></SheetContent></Sheet>;
}
