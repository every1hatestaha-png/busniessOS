"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils";

type Product = { id: string; name: string; unit: string };
type LineItem = { productId: string; quantity: string; unitCost: string; unitWeight: string; perKgRate: string };
const fieldClass = "h-8 w-full rounded-md border bg-white px-2.5 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

export function PurchaseForm({ suppliers, products }: { suppliers: Array<{ id: string; name: string }>; products: Product[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pricingMode, setPricingMode] = useState<"UNIT" | "WEIGHT">("UNIT");
  const [lines, setLines] = useState<LineItem[]>([{ productId: "", quantity: "", unitCost: "", unitWeight: "", perKgRate: "" }]);
  const updateLine = (index: number, field: keyof LineItem, value: string) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  const computeTotal = () => lines.reduce((sum, line) => {
    const quantity = Number(line.quantity) || 0;
    return sum + (pricingMode === "WEIGHT" && line.unitWeight && line.perKgRate ? Number(line.unitWeight) * quantity * Number(line.perKgRate) : quantity * (Number(line.unitCost) || 0));
  }, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const key = crypto.randomUUID();
    const items = lines.filter((line) => line.productId && line.quantity).map((line) => {
      const item: Record<string, unknown> = { productId: line.productId, quantity: Number(line.quantity), unitCost: pricingMode === "WEIGHT" && line.unitWeight && line.perKgRate ? Number(line.unitWeight) * Number(line.perKgRate) : Number(line.unitCost) };
      if (pricingMode === "WEIGHT" && line.unitWeight && line.perKgRate) { item.unitWeight = Number(line.unitWeight); item.perKgRate = Number(line.perKgRate); }
      return item;
    });
    if (!items.length) { setMessage("Add at least one line item."); setBusy(false); return; }
    const response = await fetch("/api/v1/purchases", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ supplierId: form.get("supplierId"), items, notes: form.get("notes") || "", expectedDeliveryDate: form.get("expectedDeliveryDate") || undefined, department: form.get("department") || "", pricingMode }) });
    const body = await response.json();
    if (response.ok && body.data?.id) { router.push(`/purchases/${body.data.id}`); router.refresh(); return; }
    setMessage(body.error?.message ?? "Could not create purchase order.");
    setBusy(false);
  }

  return <form onSubmit={submit} className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="space-y-4">
      <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Supplier & Document</CardTitle></CardHeader><CardContent className="grid gap-4 p-4 md:grid-cols-3"><Field label="Supplier"><select required name="supplierId" className={fieldClass}><option value="">Choose supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field><Field label="Department" hint="Optional"><Input name="department" placeholder="Department" /></Field><Field label="Expected delivery" hint="Optional"><Input name="expectedDeliveryDate" type="date" /></Field></CardContent></Card>

       <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="flex-row items-center justify-between border-b px-4 py-3"><div><CardTitle className="text-sm font-semibold">Purchase Lines</CardTitle><p className="mt-0.5 text-[11px] text-slate-500">Choose unit or weight-based pricing for this order.</p></div><div className="flex items-center gap-2"><select aria-label="Pricing mode" value={pricingMode} onChange={(event) => setPricingMode(event.target.value as "UNIT" | "WEIGHT")} className={`${fieldClass} w-40`}><option value="UNIT">Unit pricing</option><option value="WEIGHT">Weight-based pricing</option></select><Button type="button" variant="outline" size="xs" onClick={() => setLines((current) => [...current, { productId: "", quantity: "", unitCost: "", unitWeight: "", perKgRate: "" }])}><Plus />Add line</Button></div></CardHeader><CardContent className="overflow-x-auto p-0"><div className="min-w-[1000px]">
        <div className={`grid gap-2 border-b bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ${pricingMode === "WEIGHT" ? "grid-cols-[minmax(190px,1fr)_80px_90px_100px_90px_100px_110px_36px]" : "grid-cols-[minmax(220px,1fr)_90px_120px_130px_36px]"}`}><span>Product</span><span className="text-right">Qty</span>{pricingMode === "WEIGHT" && <><span className="text-right">Unit wt. kg</span><span className="text-right">Rate / kg</span><span className="text-right">Total kg</span></>}<span className="text-right">Unit cost</span><span className="text-right">Line total</span><span /></div>
        {lines.map((line, index) => {
          const quantity = Number(line.quantity) || 0;
          const selectedProduct = products.find((product) => product.id === line.productId);
          const unitCost = pricingMode === "WEIGHT" && line.unitWeight && line.perKgRate ? Number(line.unitWeight) * Number(line.perKgRate) : Number(line.unitCost) || 0;
          const lineTotal = quantity * unitCost;
          return <div key={index} className={`grid items-start gap-2 border-b px-4 py-2.5 last:border-0 ${pricingMode === "WEIGHT" ? "grid-cols-[minmax(190px,1fr)_80px_90px_100px_90px_100px_110px_36px]" : "grid-cols-[minmax(220px,1fr)_90px_120px_130px_36px]"}`}><select required value={line.productId} onChange={(event) => updateLine(index, "productId", event.target.value)} className={fieldClass}><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><Input required type="number" min={selectedProduct?.unit === "KG" && pricingMode === "UNIT" ? "0.0001" : "1"} step={selectedProduct?.unit === "KG" && pricingMode === "UNIT" ? "0.0001" : "1"} value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} className="text-right text-xs" />{pricingMode === "WEIGHT" && <><Input type="number" min="0" step="0.001" value={line.unitWeight} onChange={(event) => updateLine(index, "unitWeight", event.target.value)} className="text-right text-xs" /><Input type="number" min="0" step="0.01" value={line.perKgRate} onChange={(event) => updateLine(index, "perKgRate", event.target.value)} className="text-right text-xs" /><div className="flex h-8 items-center justify-end text-xs tabular-nums">{line.unitWeight && quantity ? (Number(line.unitWeight) * quantity).toFixed(3) : "—"}</div><div className="flex h-8 items-center justify-end text-xs tabular-nums">{unitCost > 0 ? formatPKR(unitCost) : "—"}</div></>}{pricingMode === "UNIT" && <Input required type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => updateLine(index, "unitCost", event.target.value)} className="text-right text-xs" />}<div className="flex h-8 items-center justify-end text-xs font-semibold tabular-nums">{lineTotal > 0 ? formatPKR(lineTotal) : "—"}</div><Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label={`Remove line ${index + 1}`}><Trash2 className="text-red-600" /></Button></div>;
        })}
       </div></CardContent></Card>

      <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Notes</CardTitle></CardHeader><CardContent className="p-4"><textarea name="notes" placeholder="Purchase instructions or internal notes" rows={3} className={`${fieldClass} h-auto resize-y py-2`} maxLength={1000} /></CardContent></Card>
    </div>

    <Card className="sticky top-6 gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Purchase Summary</CardTitle></CardHeader><CardContent className="space-y-4 p-4"><div><p className="text-[10px] uppercase tracking-wide text-slate-500">Estimated ordered value</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatPKR(computeTotal())}</p></div><div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-900">This order does not create inventory or supplier payable. Post a goods receipt when stock arrives.</div>{message && <p role="alert" className="text-xs text-red-600">{message}</p>}<Button disabled={busy || !suppliers.length || !products.length} type="submit" className="w-full">{busy ? "Creating..." : "Create Purchase Order"}</Button></CardContent></Card>
  </form>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">{label}{hint && <span className="text-[10px] font-normal text-slate-400">{hint}</span>}</span>{children}</label>; }
