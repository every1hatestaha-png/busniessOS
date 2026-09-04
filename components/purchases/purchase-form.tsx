"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Product = { id: string; name: string; unit: string };

type LineItem = {
  productId: string;
  quantity: string;
  unitCost: string;
  unitWeight: string;
  perKgRate: string;
};

const fieldClass = "h-8 border bg-white px-2 text-sm";

export function PurchaseForm({ suppliers, products }: { suppliers: Array<{ id: string; name: string }>; products: Product[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pricingMode, setPricingMode] = useState<"UNIT" | "WEIGHT">("UNIT");
  const [lines, setLines] = useState<LineItem[]>([
    { productId: "", quantity: "", unitCost: "", unitWeight: "", perKgRate: "" },
  ]);

  function updateLine(index: number, field: keyof LineItem, value: string) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: "", quantity: "", unitCost: "", unitWeight: "", perKgRate: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function computeTotal(): number {
    return lines.reduce((sum, line) => {
      const qty = Number(line.quantity) || 0;
      if (pricingMode === "WEIGHT" && line.unitWeight && line.perKgRate) {
        const totalWeight = Number(line.unitWeight) * qty;
        return sum + totalWeight * Number(line.perKgRate);
      }
      return sum + qty * (Number(line.unitCost) || 0);
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
        const items = lines
          .filter((line) => line.productId && line.quantity)
          .map((line) => {
            const item: Record<string, unknown> = {
              productId: line.productId,
              quantity: Number(line.quantity),
              unitCost: pricingMode === "WEIGHT" && line.unitWeight && line.perKgRate ? Number(line.unitWeight) * Number(line.perKgRate) : Number(line.unitCost),
            };
            if (pricingMode === "WEIGHT" && line.unitWeight && line.perKgRate) {
              item.unitWeight = Number(line.unitWeight);
              item.perKgRate = Number(line.perKgRate);
            }
            return item;
          });

        if (items.length === 0) {
          setMessage("Add at least one line item.");
          setBusy(false);
          return;
        }

        const response = await fetch("/api/v1/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({
            supplierId: form.get("supplierId"),
            items,
            notes: form.get("notes") || "",
            expectedDeliveryDate: form.get("expectedDeliveryDate") || undefined,
            department: form.get("department") || "",
            pricingMode,
          }),
        });
        const body = await response.json();
        if (response.ok && body.data?.id) {
          router.push(`/purchases/${body.data.id}`);
          router.refresh();
          return;
        }
        setMessage(body.error?.message ?? "Could not create purchase order.");
        setBusy(false);
      }}
    >
      <div className="grid gap-3 border p-4 md:grid-cols-3">
        <select required name="supplierId" className={fieldClass}>
          <option value="">Supplier</option>
          {suppliers.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <Input name="department" placeholder="Department (optional)" />
        <Input name="expectedDeliveryDate" type="date" placeholder="Expected delivery" />
      </div>

      <div className="border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Line Items</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-500">Pricing:</label>
            <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as "UNIT" | "WEIGHT")} className={fieldClass}>
              <option value="UNIT">Unit pricing</option>
              <option value="WEIGHT">Weight-based pricing</option>
            </select>
          </div>
        </div>

        <div className="grid gap-2 text-xs font-medium text-neutral-500" style={{ gridTemplateColumns: pricingMode === "WEIGHT" ? "1fr 80px 80px 80px 80px 100px 36px" : "1fr 80px 100px 100px 36px" }}>
          <span>Product</span>
          <span className="text-right">Qty</span>
          {pricingMode === "WEIGHT" && <><span className="text-right">Unit Wt (kg)</span><span className="text-right">Rate/kg</span><span className="text-right">Total Wt (kg)</span></>}
          <span className="text-right">Unit Cost</span>
          <span className="text-right">Line Total</span>
          <span></span>
        </div>

        {lines.map((line, index) => {
          const qty = Number(line.quantity) || 0;
          const selectedProduct = products.find((product) => product.id === line.productId);
          const lineTotal =
            pricingMode === "WEIGHT" && line.unitWeight && line.perKgRate
              ? Number(line.unitWeight) * qty * Number(line.perKgRate)
              : qty * (Number(line.unitCost) || 0);

          return (
            <div
              key={index}
              className="grid gap-2"
              style={{ gridTemplateColumns: pricingMode === "WEIGHT" ? "1fr 80px 80px 80px 80px 100px 36px" : "1fr 80px 100px 100px 36px" }}
            >
              <select required value={line.productId} onChange={(e) => updateLine(index, "productId", e.target.value)} className={fieldClass}>
                <option value="">Product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Input required type="number" min={selectedProduct?.unit === "KG" && pricingMode === "UNIT" ? "0.0001" : "1"} step={selectedProduct?.unit === "KG" && pricingMode === "UNIT" ? "0.0001" : "1"} value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value)} placeholder={selectedProduct?.unit === "KG" && pricingMode === "UNIT" ? "KG" : "Qty"} className="text-right" />
              {pricingMode === "WEIGHT" && (
                <>
                  <Input type="number" min="0" step="0.001" value={line.unitWeight} onChange={(e) => updateLine(index, "unitWeight", e.target.value)} placeholder="Wt" className="text-right" />
                  <Input type="number" min="0" step="0.01" value={line.perKgRate} onChange={(e) => updateLine(index, "perKgRate", e.target.value)} placeholder="Rate" className="text-right" />
                  <div className="h-8 flex items-center justify-end text-sm text-neutral-500">{line.unitWeight && qty ? (Number(line.unitWeight) * qty).toFixed(2) : "—"}</div>
                </>
              )}
              {pricingMode === "UNIT" && <Input required type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => updateLine(index, "unitCost", e.target.value)} placeholder="Unit cost" className="text-right" />}
              <div className="h-8 flex items-center justify-end text-sm font-medium">{lineTotal > 0 ? lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</div>
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(index)} className="h-8 w-9 flex items-center justify-center text-neutral-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}

        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Plus className="mr-1 h-3 w-3" /> Add line
        </Button>
      </div>

      <div className="border p-4">
        <textarea name="notes" placeholder="Notes (optional)" rows={2} className="w-full border bg-white px-3 py-2 text-sm" maxLength={1000} />
      </div>

      <div className="flex items-center justify-between border p-4">
        <div>
          <span className="text-sm text-neutral-500">Estimated total:</span>
          <span className="ml-2 text-lg font-bold">{computeTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-center gap-3">
          <Button disabled={busy || !suppliers.length || !products.length} type="submit">
            {busy ? "Creating..." : "Create Purchase Order"}
          </Button>
          {message && <p className="text-sm text-red-600">{message}</p>}
        </div>
      </div>
    </form>
  );
}
