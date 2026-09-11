"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function ReverseExpenseButton({ expenseId, voucherNumber }: { expenseId: string; voucherNumber: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reverseExpense() {
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setError("Enter a brief reason for reversing this expense.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/accounting/expenses/${expenseId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cleanReason }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message ?? "Expense reversal failed.");
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
      <SheetTrigger render={<Button type="button" variant="destructive" size="sm" />}>Reverse expense</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Reverse {voucherNumber}?</SheetTitle>
          <SheetDescription>The original expense voucher remains in the audit trail.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="text-xs leading-relaxed">The expense general-ledger posting will be reversed and the paid amount will be restored to its cash/bank account. The original voucher is never deleted.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="expense-reversal-reason" className="text-sm font-medium">Reason</label>
            <Input id="expense-reversal-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="e.g. Duplicate expense voucher" disabled={busy} />
          </div>
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        </div>
        <SheetFooter className="border-t">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep expense</Button>
          <Button type="button" variant="destructive" onClick={reverseExpense} disabled={busy}>{busy ? "Reversing..." : "Confirm reversal"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
