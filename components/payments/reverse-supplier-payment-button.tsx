"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function ReverseSupplierPaymentButton({ paymentId, documentNumber }: { paymentId: string; documentNumber: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reverse() {
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setError("Enter a brief reason for the reversal.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/supplier-payments/${paymentId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cleanReason }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message ?? "Supplier payment reversal failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("The reversal result is unknown. Refresh this voucher before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="destructive" size="sm" />}>Reverse payment</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Reverse {documentNumber}?</SheetTitle>
          <SheetDescription>This keeps the original voucher and posts a financial reversal.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="text-xs leading-relaxed">Supplier payable, purchase allocations, cash/bank and withholding-tax general-ledger entries will be reversed. The original voucher remains in the audit trail.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="supplier-payment-reversal-reason" className="text-sm font-medium">Reason</label>
            <Input id="supplier-payment-reversal-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="e.g. Duplicate supplier voucher" disabled={busy} />
          </div>
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        </div>
        <SheetFooter className="border-t">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep payment</Button>
          <Button type="button" variant="destructive" onClick={reverse} disabled={busy}>{busy ? "Reversing..." : "Confirm reversal"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
