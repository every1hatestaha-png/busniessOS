"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function CancelCustomerReturnButton({ returnId, number }: { returnId: string; number: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function cancelReturn() {
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setError("Enter a brief reason for cancelling this customer return.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/customer-returns/${returnId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cleanReason }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message ?? "Customer return cancellation failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("The cancellation result is unknown. Refresh this sale before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="destructive" size="xs" />}>Cancel return</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Cancel {number}?</SheetTitle>
          <SheetDescription>This keeps the original return and credit note in the audit trail.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="text-xs leading-relaxed">Customer receivable and GL effects will be restored. If the return restocked inventory, the exact historical return stock value will be removed again. Returns whose credit note has already been applied cannot be cancelled automatically.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`customer-return-cancel-${returnId}`} className="text-sm font-medium">Reason</label>
            <Input id={`customer-return-cancel-${returnId}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="e.g. Return entered by mistake" disabled={busy} />
          </div>
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        </div>
        <SheetFooter className="border-t">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep return</Button>
          <Button type="button" variant="destructive" onClick={cancelReturn} disabled={busy}>{busy ? "Cancelling..." : "Confirm cancellation"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
