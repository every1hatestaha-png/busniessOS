"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function CancelSupplierReturnButton({ returnId, number }: { returnId: string; number: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function cancelReturn() {
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setError("Enter a brief reason for cancelling this supplier return.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/supplier-returns/${returnId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cleanReason }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message ?? "Supplier return cancellation failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("The cancellation result is unknown. Refresh this return before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="destructive" size="sm" />}>Cancel return</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Cancel {number}?</SheetTitle>
          <SheetDescription>This posts a financial reversal and keeps the original return in the audit trail.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="text-xs leading-relaxed">Returned stock will be restored, supplier payable and purchase outstanding will be restored, and the return&apos;s general-ledger posting will be reversed.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="supplier-return-cancel-reason" className="text-sm font-medium">Reason</label>
            <Input id="supplier-return-cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="e.g. Return entered against wrong supplier" disabled={busy} />
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
