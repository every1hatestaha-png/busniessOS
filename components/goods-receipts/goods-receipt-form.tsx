"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type POItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  unitWeight: number | null;
  totalWeight: number | null;
  perKgRate: number | null;
};

type ReceiptItem = {
  purchaseOrderItemId: string;
  receivedQuantity: string;
  acceptedQuantity: string;
  actualUnitCost: string;
};

export function GoodsReceiptForm({ purchaseOrderId, poNumber, items }: { purchaseOrderId: string; poNumber: string; items: POItem[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptItem[]>(
    items.map((item) => ({
      purchaseOrderItemId: item.id,
      receivedQuantity: "",
      acceptedQuantity: "",
      actualUnitCost: String(item.unitCost),
    }))
  );

  function updateReceipt(index: number, field: keyof ReceiptItem, value: string) {
    setReceipts((prev) => prev.map((r, i) => {
      if (i !== index) return r;
      const updated = { ...r, [field]: value };
      if (field === "receivedQuantity") {
        updated.acceptedQuantity = value;
      }
      return updated;
    }));
  }

  function computeTotal(): number {
    return receipts.reduce((sum, r, i) => {
      const accepted = Number(r.acceptedQuantity) || 0;
      const cost = Number(r.actualUnitCost) || items[i].unitCost;
      return sum + accepted * cost;
    }, 0);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        const form = new FormData(event.currentTarget);
        const key = crypto.randomUUID();

        const itemsPayload = receipts
          .filter((r) => Number(r.receivedQuantity) > 0)
          .map((r) => ({
            purchaseOrderItemId: r.purchaseOrderItemId,
            receivedQuantity: Number(r.receivedQuantity),
            acceptedQuantity: Number(r.acceptedQuantity),
            actualUnitCost: Number(r.actualUnitCost),
          }));

        if (itemsPayload.length === 0) {
          setMessage("Receive at least one item.");
          setBusy(false);
          return;
        }

        const response = await fetch("/api/v1/goods-receipts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({
            purchaseOrderId,
            receiptDate: form.get("receiptDate") || undefined,
            notes: form.get("notes") || "",
            receivedBy: form.get("receivedBy") || "",
            checkedBy: form.get("checkedBy") || "",
            items: itemsPayload,
          }),
        });
        const body = await response.json();
        if (response.ok && body.data?.id) {
          router.push(`/goods-receipts/${body.data.id}`);
          router.refresh();
          return;
        }
        setMessage(body.error?.message ?? "Could not post goods receipt.");
        setBusy(false);
      }}
    >
      <div className="grid gap-3 border p-4 md:grid-cols-4">
        <div>
          <label className="text-xs text-neutral-500">PO Reference</label>
          <p className="font-mono text-sm font-semibold">{poNumber}</p>
        </div>
        <Input name="receiptDate" type="date" placeholder="Receipt date" />
        <Input name="receivedBy" placeholder="Received by" />
        <Input name="checkedBy" placeholder="Checked by" />
      </div>

      <div className="border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Receive Items</h3>
        <div className="grid gap-2 text-xs font-medium text-neutral-500" style={{ gridTemplateColumns: "1fr 70px 70px 70px 70px 90px" }}>
          <span>Product</span>
          <span className="text-right">Ordered</span>
          <span className="text-right">Remaining</span>
          <span className="text-right">Receive</span>
          <span className="text-right">Accept</span>
          <span className="text-right">Actual Cost</span>
        </div>

        {items.map((item, index) => {
          const received = Number(receipts[index]?.receivedQuantity) || 0;
          const overRemaining = received > item.remainingQuantity;

          return (
            <div key={item.id} className="grid gap-2" style={{ gridTemplateColumns: "1fr 70px 70px 70px 70px 90px" }}>
              <div className="h-8 flex items-center text-sm">
                {item.productName}
                {item.sku && <span className="ml-1 font-mono text-xs text-neutral-400">{item.sku}</span>}
              </div>
              <div className="h-8 flex items-center justify-end text-sm">{item.orderedQuantity}</div>
              <div className="h-8 flex items-center justify-end text-sm font-semibold">{item.remainingQuantity}</div>
              <Input
                type="number"
                min="0"
                max={item.remainingQuantity}
                value={receipts[index]?.receivedQuantity || ""}
                onChange={(e) => updateReceipt(index, "receivedQuantity", e.target.value)}
                className={`text-right ${overRemaining ? "border-red-500" : ""}`}
              />
              <Input
                type="number"
                min="0"
                max={received}
                value={receipts[index]?.acceptedQuantity || ""}
                onChange={(e) => updateReceipt(index, "acceptedQuantity", e.target.value)}
                className="text-right"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={receipts[index]?.actualUnitCost || ""}
                onChange={(e) => updateReceipt(index, "actualUnitCost", e.target.value)}
                className="text-right"
              />
            </div>
          );
        })}
      </div>

      <div className="border p-4">
        <textarea name="notes" placeholder="Notes (optional)" rows={2} className="w-full border bg-white px-3 py-2 text-sm" maxLength={1000} />
      </div>

      <div className="flex items-center justify-between border p-4">
        <div>
          <span className="text-sm text-neutral-500">GRN total value:</span>
          <span className="ml-2 text-lg font-bold">{computeTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-center gap-3">
          <Button disabled={busy} type="submit">
            {busy ? "Posting..." : "Post Goods Receipt"}
          </Button>
          {message && <p className="text-sm text-red-600">{message}</p>}
        </div>
      </div>
    </form>
  );
}
