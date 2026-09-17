"use client";

import Link from "next/link";
import { startTransition, useActionState, useMemo, useState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";

import { updateSaleAction, type EditSaleState } from "@/app/(dashboard)/sales/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils";
import type { SaleEditInput } from "@/lib/validation/sale-edit";

type CustomerOption = { id: string; name: string; companyName: string };
type ProductOption = { id: string; name: string; sku: string; sellingPrice: number; stockQuantity: number; defaultWeightKg: number | null };
type EditLine = { productId: string; quantity: number; pricingMode: "UNIT" | "WEIGHT"; unitWeight?: number; perKgRate?: number; unitPrice: number; discountPerUnit: number };
type InitialSale = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  issuedAt: string;
  dueDate: string;
  gstRate: number;
  orderDiscount: number;
  notes: string;
  items: EditLine[];
};

const fieldClass = "h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";

export function EditSaleForm({ initialSale, customers, products }: { initialSale: InitialSale; customers: CustomerOption[]; products: ProductOption[] }) {
  const [state, action, pending] = useActionState(updateSaleAction, {} as EditSaleState);
  const [customerId, setCustomerId] = useState(initialSale.customerId);
  const [issuedAt, setIssuedAt] = useState(initialSale.issuedAt);
  const [dueDate, setDueDate] = useState(initialSale.dueDate);
  const [gstRate, setGstRate] = useState(initialSale.gstRate);
  const [orderDiscount, setOrderDiscount] = useState(initialSale.orderDiscount);
  const [notes, setNotes] = useState(initialSale.notes);
  const [items, setItems] = useState<EditLine[]>(initialSale.items);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * effectiveUnitPrice(item), 0);
    const lineDiscount = items.reduce((sum, item) => sum + item.quantity * item.discountPerUnit, 0);
    const taxable = Math.max(0, subtotal - lineDiscount - orderDiscount);
    const gst = Number((taxable * gstRate / 100).toFixed(2));
    return { subtotal, lineDiscount, taxable, gst, total: taxable + gst };
  }, [items, orderDiscount, gstRate]);

  function patchLine(index: number, patch: Partial<EditLine>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return patchLine(index, { productId });
    patchLine(index, { productId, unitPrice: product.sellingPrice, pricingMode: "UNIT", unitWeight: undefined, perKgRate: undefined });
  }

  function submit() {
    const payload: SaleEditInput = {
      saleId: initialSale.id,
      customerId,
      issuedAt,
      dueDate: dueDate || null,
      items,
      orderDiscount,
      gstRate,
      notes,
    };
    startTransition(() => action(payload));
  }

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-medium text-slate-500">Edit invoice</p><h1 className="text-2xl font-semibold tracking-tight">{initialSale.invoiceNumber}</h1><p className="mt-1 text-sm text-slate-500">Financial edits are allowed only while there are no payments, credits, or active returns.</p></div>
      <div className="flex gap-2"><Button variant="outline" render={<Link href={`/invoices/${initialSale.invoiceId}`} />}>Cancel</Button><Button onClick={submit} disabled={pending}>{pending ? "Saving..." : "Save invoice"}</Button></div>
    </header>

    {state.error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 size-4 shrink-0" />{state.error}</div>}

    <section className="rounded-xl border bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold">Invoice details</h2>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Customer"><select className={fieldClass} value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName} · {customer.name}</option>)}</select></Field>
        <Field label="Issue date"><Input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} /></Field>
        <Field label="Due date"><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
        <Field label="GST %"><Input type="number" min="0" max="100" step="0.01" value={gstRate} onChange={(event) => setGstRate(Number(event.target.value))} /></Field>
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b p-4"><div><h2 className="text-sm font-semibold">Line items</h2><p className="text-xs text-slate-500">Edit product, quantity, rate, pricing mode and per-piece discount.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => [...current, { productId: products[0]?.id ?? "", quantity: 1, pricingMode: "UNIT", unitPrice: products[0]?.sellingPrice ?? 0, discountPerUnit: 0 }])}><Plus />Add line</Button></div>
      <div className="overflow-x-auto">
        <div className="min-w-[950px]">
          <div className="grid grid-cols-[minmax(220px,1fr)_90px_120px_110px_110px_110px_44px] gap-2 border-b bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><span>Product</span><span>Qty</span><span>Pricing</span><span>Rate</span><span>Disc/unit</span><span className="text-right">Amount</span><span /></div>
          {items.map((item, index) => {
            const product = products.find((entry) => entry.id === item.productId);
            const lineAmount = Math.max(0, item.quantity * (effectiveUnitPrice(item) - item.discountPerUnit));
            return <div key={`${item.productId}-${index}`} className="grid grid-cols-[minmax(220px,1fr)_90px_120px_110px_110px_110px_44px] items-start gap-2 border-b px-4 py-3 last:border-0">
              <div><select className={fieldClass} value={item.productId} onChange={(event) => selectProduct(index, event.target.value)}>{products.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.sku ? ` · ${entry.sku}` : ""}</option>)}</select>{product && <p className="mt-1 text-[10px] text-slate-500">Available after original sale is restored: current {product.stockQuantity} + original quantity</p>}</div>
              <Input type="number" min="0.0001" step="0.0001" value={item.quantity} onChange={(event) => patchLine(index, { quantity: Number(event.target.value) })} />
              <select className={fieldClass} value={item.pricingMode} onChange={(event) => patchLine(index, { pricingMode: event.target.value as "UNIT" | "WEIGHT" })}><option value="UNIT">Per unit</option><option value="WEIGHT">By weight</option></select>
              {item.pricingMode === "WEIGHT" ? <div className="space-y-1"><Input aria-label="kg per unit" type="number" min="0.001" step="0.001" placeholder="kg/unit" value={item.unitWeight ?? ""} onChange={(event) => patchLine(index, { unitWeight: Number(event.target.value) })} /><Input aria-label="rate per kg" type="number" min="0.01" step="0.01" placeholder="Rs/kg" value={item.perKgRate ?? ""} onChange={(event) => patchLine(index, { perKgRate: Number(event.target.value) })} /></div> : <Input type="number" min="0.01" step="0.01" value={item.unitPrice} onChange={(event) => patchLine(index, { unitPrice: Number(event.target.value) })} />}
              <Input type="number" min="0" step="0.01" value={item.discountPerUnit} onChange={(event) => patchLine(index, { discountPerUnit: Number(event.target.value) })} />
              <div className="flex h-9 items-center justify-end text-sm font-semibold tabular-nums">{formatPKR(lineAmount)}</div>
              <Button type="button" variant="ghost" size="icon" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button>
            </div>;
          })}
        </div>
      </div>
    </section>

    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="rounded-xl border bg-white p-5"><Field label="Notes"><textarea className="min-h-28 w-full rounded-md border border-input bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-primary/15" value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></section>
      <section className="space-y-3 rounded-xl border bg-white p-5 text-sm"><Summary label="Subtotal" value={formatPKR(totals.subtotal)} /><Summary label="Line discount" value={`- ${formatPKR(totals.lineDiscount)}`} /><Field label="Order discount"><Input type="number" min="0" step="0.01" value={orderDiscount} onChange={(event) => setOrderDiscount(Number(event.target.value))} /></Field><Summary label="Taxable" value={formatPKR(totals.taxable)} /><Summary label={`GST (${gstRate}%)`} value={formatPKR(totals.gst)} /><div className="flex justify-between border-t pt-3 text-base font-bold"><span>Total</span><span>{formatPKR(totals.total)}</span></div></section>
    </div>
  </div>;
}

function effectiveUnitPrice(item: EditLine) {
  return item.pricingMode === "WEIGHT" && item.unitWeight && item.perKgRate ? item.unitWeight * item.perKgRate : item.unitPrice;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-600">{label}</span>{children}</label>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium tabular-nums">{value}</span></div>; }
