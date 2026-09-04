"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatPKR } from "@/lib/utils";

type GrnItem = {
  id: string;
  purchaseOrderItemId: string;
  productName: string;
  sku: string;
  orderedQuantity: number;
  previouslyReceived: number;
  receivedNow: number;
  acceptedQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  totalCost: number;
  unit: string;
};

type EditableGrn = {
  id: string;
  grnNumber: string;
  status: string;
  receivedBy: string | null;
  checkedBy: string | null;
  notes: string | null;
  hasSupplierReturns: boolean;
  items: GrnItem[];
};

export function EditGrnSheet({ grn }: { grn: EditableGrn }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState(
    grn.items.map((item) => ({
      purchaseOrderItemId: item.purchaseOrderItemId,
      receivedQuantity: String(item.receivedNow),
      acceptedQuantity: String(item.acceptedQuantity),
      actualUnitCost: String(item.unitCost),
    }))
  );

  function updateItem(index: number, field: string, value: string) {
    setItems((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function computeTotal(): number {
    return items.reduce((sum, r) => {
      const accepted = Number(r.acceptedQuantity) || 0;
      const cost = Number(r.actualUnitCost);
      return sum + accepted * cost;
    }, 0);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    const form = new FormData(e.currentTarget);
    const payload = {
      notes: form.get("notes") || "",
      receivedBy: form.get("receivedBy") || "",
      checkedBy: form.get("checkedBy") || "",
      items: items.map((r) => ({
        purchaseOrderItemId: r.purchaseOrderItemId,
        receivedQuantity: Number(r.receivedQuantity),
        acceptedQuantity: Number(r.acceptedQuantity),
        actualUnitCost: Number(r.actualUnitCost),
      })),
    };

    try {
      const res = await fetch(`/api/v1/goods-receipts/${grn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error?.message ?? "Could not update GRN.");
        setBusy(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Pencil className="h-3.5 w-3.5" />
            Edit GRN
          </Button>
        }
      />
      <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Edit {grn.grnNumber}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-500">Received by</label>
              <Input name="receivedBy" defaultValue={grn.receivedBy ?? ""} placeholder="Received by" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Checked by</label>
              <Input name="checkedBy" defaultValue={grn.checkedBy ?? ""} placeholder="Checked by" className="mt-1" />
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Line Items</h4>
            <div className="grid gap-2 text-xs font-medium text-neutral-500" style={{ gridTemplateColumns: "1fr 80px 80px 100px" }}>
              <span>Product</span>
              <span className="text-right">Received</span>
              <span className="text-right">Accepted</span>
              <span className="text-right">Rate / Cost</span>
            </div>
            {grn.items.map((item, index) => (
              <div key={item.purchaseOrderItemId} className="grid gap-2" style={{ gridTemplateColumns: "1fr 80px 80px 100px" }}>
                <div className="flex h-8 items-center text-sm">
                  {item.productName}
                  {item.sku && <span className="ml-1 font-mono text-xs text-neutral-400">{item.sku}</span>}
                </div>
                <Input
                  type="number"
                  min="0"
                  step={item.unit === "KG" ? "0.0001" : "1"}
                  value={items[index]?.receivedQuantity ?? ""}
                  onChange={(e) => updateItem(index, "receivedQuantity", e.target.value)}
                  className="text-right"
                />
                <Input
                  type="number"
                  min="0"
                  step={item.unit === "KG" ? "0.0001" : "1"}
                  value={items[index]?.acceptedQuantity ?? ""}
                  onChange={(e) => updateItem(index, "acceptedQuantity", e.target.value)}
                  className="text-right"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={items[index]?.actualUnitCost ?? ""}
                  onChange={(e) => updateItem(index, "actualUnitCost", e.target.value)}
                  className="text-right"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-neutral-500">Notes</label>
            <textarea
              name="notes"
              defaultValue={grn.notes ?? ""}
              placeholder="Notes (optional)"
              rows={2}
              className="mt-1 w-full border bg-white px-3 py-2 text-sm"
              maxLength={1000}
            />
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <span className="text-sm text-neutral-500">Updated total:</span>
              <span className="ml-2 text-lg font-bold">
                {formatPKR(computeTotal())}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {message && <p className="text-sm text-red-600">{message}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
