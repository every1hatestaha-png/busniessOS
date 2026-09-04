"use client";

import { useState } from "react";
import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { archiveProductAction } from "@/app/(dashboard)/inventory/actions";

export function ArchiveProductButton({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function archive() {
    setBusy(true);
    setError("");
    try {
      const result = await archiveProductAction(productId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
        setOpen(false);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Archive className="h-3.5 w-3.5" />Archive
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Archive {productName}?</SheetTitle>
          <SheetDescription>The product will be hidden from new transactions but its history remains intact.</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <p className="mt-3 text-xs text-neutral-600">
            Archiving removes this product from dropdowns and selectors for new sales, purchases, and adjustments.
            Existing reports, invoices, and historical records will continue to reference this product.
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
        <SheetFooter className="border-t">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={archive} disabled={busy}>
            {busy ? "Archiving..." : "Archive product"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
