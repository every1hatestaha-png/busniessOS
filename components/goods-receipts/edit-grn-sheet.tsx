"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  perKgRate: number | null;
  receivedWeightKg: number | null;
  acceptedWeightKg: number | null;
  ratePerKg: number | null;
  lineAmount: number | null;
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
      receivedWeightKg: item.receivedWeightKg != null ? String(item.receivedWeightKg) : "",
      acceptedWeightKg: item.acceptedWeightKg != null ? String(item.acceptedWeightKg) : "",
      ratePerKg: item.ratePerKg != null ? String(item.ratePerKg) : "",
    }))
  );

  function updateItem(index: number, field: string, value: string) {
    setItems((prev) => prev.map((r, i) => {
      if (i !== index) return r;
      const updated = { ...r, [field]: value };
      const item = grn.items[index];
      if (item?.perKgRate != null) {
        if (field === "receivedQuantity") updated.receivedWeightKg = value;
        if (field === "acceptedQuantity") updated.acceptedWeightKg = value;
      }
      return updated;
    }));
  }

  function computeTotal(): number {
    return items.reduce((sum, r, index) => {
      const item = grn.items[index];
      if (item?.perKgRate) {
        const acceptedWeight = Number(r.acceptedWeightKg) || 0;
        const rate = Number(r.ratePerKg) || 0;
        return sum + acceptedWeight * rate;
      }
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
      items: items.map((r, index) => {
        const item = grn.items[index];
        const isWeighted = item?.perKgRate != null;
        const base = {
          purchaseOrderItemId: r.purchaseOrderItemId,
          receivedQuantity: Number(r.receivedQuantity),
          acceptedQuantity: Number(r.acceptedQuantity),
          actualUnitCost: Number(r.actualUnitCost),
        };
        if (isWeighted) {
          return { ...base, receivedWeightKg: Number(r.receivedWeightKg) || 0, acceptedWeightKg: Number(r.acceptedWeightKg) || 0, ratePerKg: Number(r.ratePerKg) || 0 };
        }
        return base;
      }),
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
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="border-b">
          <SheetTitle>Edit {grn.grnNumber}</SheetTitle>
          <SheetDescription>Adjust receipt metadata and quantities. Inventory, payable, and General Ledger differences are applied atomically.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-700">Received by</label>
              <Input name="receivedBy" defaultValue={grn.receivedBy ?? ""} placeholder="Received by" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Checked by</label>
              <Input name="checkedBy" defaultValue={grn.checkedBy ?? ""} placeholder="Checked by" className="mt-1" />
            </div>
          </div>

          <div className="space-y-2">
            <div><h4 className="text-sm font-semibold">Receipt Lines</h4><p className="mt-0.5 text-[11px] text-slate-500">Accepted cannot exceed physically received quantity. The server remains authoritative for PO capacity.</p></div>
            <div className="grid grid-cols-[minmax(170px,1fr)_90px_90px_90px_110px] gap-2 rounded-t-md border bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Product / Capacity</span>
              <span className="text-right">Received</span>
              <span className="text-right">Accepted</span>
              <span className="text-right">Rate / Cost</span>
              <span className="text-right">Accepted value</span>
            </div>
            {grn.items.map((item, index) => {
              const isWeighted = item.perKgRate != null;
              return (
              <div key={item.purchaseOrderItemId} className="grid grid-cols-[minmax(170px,1fr)_90px_90px_90px_110px] items-start gap-2 border-x border-b px-3 py-2.5 last:rounded-b-md">
                <div className="text-xs">
                  <p className="font-medium">{item.productName}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Ordered {item.orderedQuantity} · prev. accepted {item.previouslyReceived} · remaining {item.remainingQuantity} {item.unit.toLowerCase()}</p>
                  {isWeighted && <p className="text-[10px] text-slate-500">{item.ratePerKg != null ? `${formatPKR(item.ratePerKg)}/kg` : ""}</p>}
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
                  max={Number(items[index]?.receivedQuantity || 0)}
                />
                {isWeighted ? (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={items[index]?.ratePerKg ?? ""}
                    onChange={(e) => updateItem(index, "ratePerKg", e.target.value)}
                    className="text-right"
                  />
                ) : (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={items[index]?.actualUnitCost ?? ""}
                    onChange={(e) => updateItem(index, "actualUnitCost", e.target.value)}
                    className="text-right"
                  />
                )}
                <div className="flex h-8 items-center justify-end text-xs font-semibold tabular-nums">
                  {isWeighted
                    ? formatPKR((Number(items[index]?.acceptedWeightKg) || 0) * (Number(items[index]?.ratePerKg) || 0))
                    : formatPKR((Number(items[index]?.acceptedQuantity) || 0) * (Number(items[index]?.actualUnitCost) || 0))
                  }
                </div>
              </div>
              );
            })}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Notes</label>
            <textarea
              name="notes"
              defaultValue={grn.notes ?? ""}
              placeholder="Notes (optional)"
              rows={2}
              className="mt-1 w-full rounded-md border bg-white px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              maxLength={1000}
            />
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <span className="text-xs text-slate-500">Updated accepted value:</span>
              <span className="ml-2 text-lg font-semibold tabular-nums">
                {formatPKR(computeTotal())}
              </span>
            </div>
            {message && <p className="text-xs text-red-600">{message}</p>}
          </div>
          <SheetFooter className="-mx-4 -mb-4 border-t"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save Changes"}</Button></SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
