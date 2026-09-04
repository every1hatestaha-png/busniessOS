"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function DeletePurchaseButton({ purchaseId, orderNumber }: { purchaseId: string; orderNumber: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function remove() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/purchases/${purchaseId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) { setMessage(body.error?.message ?? "Purchase could not be deleted."); return; }
      router.push("/purchases"); router.refresh();
    } catch { setMessage("Network error. Please try again."); }
    finally { setBusy(false); }
  }
  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button type="button" variant="destructive" size="sm" />}><Trash2 />Delete</SheetTrigger><SheetContent side="right" className="w-full sm:max-w-md"><SheetHeader className="border-b"><SheetTitle>Delete {orderNumber}?</SheetTitle><SheetDescription>Only a pristine draft purchase order can be permanently deleted.</SheetDescription></SheetHeader><div className="px-4"><p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-800">This is permanent. The order must have no receiving, payment, return, ledger, or accounting history.</p>{message && <p role="alert" className="mt-3 text-xs text-red-700">{message}</p>}</div><SheetFooter className="border-t"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep Purchase</Button><Button type="button" variant="destructive" onClick={remove} disabled={busy}>{busy ? "Deleting..." : "Delete Draft"}</Button></SheetFooter></SheetContent></Sheet>;
}
