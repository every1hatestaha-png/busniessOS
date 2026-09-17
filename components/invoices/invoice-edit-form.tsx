"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";

import { updateInvoiceDocumentAction, updateInvoiceFinancialAction, type InvoiceEditActionState } from "@/app/(dashboard)/invoices/[id]/edit/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils";

export type InvoiceEditCustomer = { id: string; label: string };
export type InvoiceEditProduct = { id: string; name: string; sku: string; sellingPrice: number; stockQuantity: number; defaultWeightKg: number | null };
export type InvoiceEditLine = { productId: string; quantity: number; pricingMode: "UNIT" | "WEIGHT"; unitWeight: number | null; perKgRate: number | null; unitPrice: number; discountPerUnit: number };

export function InvoiceEditForm({
  invoice,
  customers,
  products,
  financialLockReason,
}: {
  invoice: {
    id: string;
    invoiceNumber: string;
    issuedAt: string;
    dueDate: string | null;
    dcNumber: string;
    documentNotes: string;
    customerId: string;
    orderDiscount: number;
    gstRate: number;
    saleNotes: string;
    items: InvoiceEditLine[];
  };
  customers: InvoiceEditCustomer[];
  products: InvoiceEditProduct[];
  financialLockReason: string | null;
}) {
  const documentAction = updateInvoiceDocumentAction.bind(null, invoice.id);
  const financialAction = updateInvoiceFinancialAction.bind(null, invoice.id);
  const [documentState, submitDocument, documentPending] = useActionState(documentAction, {} as InvoiceEditActionState);
  const [financialState, submitFinancial, financialPending] = useActionState(financialAction, {} as InvoiceEditActionState);
  const [customerId, setCustomerId] = useState(invoice.customerId);
  const [orderDiscount, setOrderDiscount] = useState(invoice.orderDiscount);
  const [gstRate, setGstRate] = useState(invoice.gstRate);
  const [saleNotes, setSaleNotes] = useState(invoice.saleNotes);
  const [items, setItems] = useState<InvoiceEditLine[]>(invoice.items);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * effectiveUnitPrice(item), 0);
    const lineDiscount = items.reduce((sum, item) => sum + item.quantity * Math.max(0, item.discountPerUnit || 0), 0);
    const taxable = Math.max(0, subtotal - lineDiscount - Math.max(0, orderDiscount || 0));
    const gst = Number((taxable * Math.max(0, gstRate || 0) / 100).toFixed(2));
    return { subtotal, lineDiscount, taxable, gst, total: taxable + gst };
  }, [items, orderDiscount, gstRate]);

  function patchLine(index: number, patch: Partial<InvoiceEditLine>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return patchLine(index, { productId });
    const weighted = Boolean(product.defaultWeightKg && product.defaultWeightKg > 0);
    patchLine(index, {
      productId,
      pricingMode: weighted ? "WEIGHT" : "UNIT",
      unitWeight: weighted ? product.defaultWeightKg : null,
      perKgRate: weighted ? product.sellingPrice : null,
      unitPrice: weighted && product.defaultWeightKg ? product.defaultWeightKg * product.sellingPrice : product.sellingPrice,
    });
  }

  const payload = JSON.stringify({ customerId, orderDiscount: Number(orderDiscount || 0), gstRate: Number(gstRate || 0), notes: saleNotes, items });

  return <div className="mx-auto max-w-[1400px] space-y-6 pb-10">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><Link href={`/invoices/${invoice.id}`} className="text-sm font-medium text-neutral-500 hover:text-neutral-900">← Back to invoice</Link><h1 className="mt-2 text-2xl font-bold">Edit {invoice.invoiceNumber}</h1><p className="mt-1 text-sm text-neutral-500">Document fields stay editable; accounting lines are protected when payments, credits or returns exist.</p></div>
    </header>

    <form action={submitDocument} className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4"><h2 className="font-semibold">Invoice & Gate Pass details</h2><p className="mt-1 text-sm text-neutral-500">These fields do not change stock or accounting totals.</p></div>
      {documentState.error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{documentState.error}</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Issue date"><Input type="date" name="issuedAt" required defaultValue={invoice.issuedAt.slice(0, 10)} /></Field>
        <Field label="Due date"><Input type="date" name="dueDate" defaultValue={invoice.dueDate?.slice(0, 10) ?? ""} /></Field>
        <Field label="DC / Gate Pass no."><Input name="dcNumber" required maxLength={32} defaultValue={invoice.dcNumber} className="font-mono" /></Field>
        <div className="md:col-span-2 xl:col-span-1"><Field label="Document notes"><Input name="documentNotes" maxLength={500} defaultValue={invoice.documentNotes} placeholder="Optional gate pass / invoice note" /></Field></div>
      </div>
      <div className="mt-5 flex justify-end"><Button type="submit" disabled={documentPending}>{documentPending ? "Saving..." : "Save document details"}</Button></div>
    </form>

    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4"><h2 className="font-semibold">Invoice financial lines</h2><p className="mt-1 text-sm text-neutral-500">Changing these values recalculates stock, customer balance, ledger and General Ledger in one transaction.</p></div>
      {financialLockReason ? <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">Financial editing is locked for safety.</p><p className="mt-1">{financialLockReason}</p><p className="mt-1 text-xs">Issue date, due date, DC number and document notes can still be changed above.</p></div></div> : <form action={submitFinancial} className="space-y-5">
        <input type="hidden" name="payload" value={payload} />
        {financialState.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{financialState.error}</p>}
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Customer"><select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={selectClass}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}</option>)}</select></Field>
          <Field label="Order discount"><Input type="number" min="0" step="0.01" value={orderDiscount} onChange={(e) => setOrderDiscount(Number(e.target.value))} /></Field>
          <Field label="GST %"><Input type="number" min="0" max="100" step="0.01" value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} /></Field>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[2fr_90px_120px_120px_120px_120px_44px] gap-2 border-b bg-neutral-50 px-3 py-2 text-[11px] font-semibold uppercase text-neutral-500"><span>Product</span><span>Qty</span><span>Pricing</span><span>Weight kg</span><span>Rate / unit</span><span>Disc / unit</span><span /></div>
            {items.map((item, index) => {
              const product = products.find((entry) => entry.id === item.productId);
              return <div key={`${index}-${item.productId}`} className="grid grid-cols-[2fr_90px_120px_120px_120px_120px_44px] items-start gap-2 border-b px-3 py-3 last:border-0">
                <div><select value={item.productId} onChange={(e) => selectProduct(index, e.target.value)} className={selectClass}><option value="">Select product</option>{products.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.sku ? ` · ${entry.sku}` : ""}</option>)}</select>{product && <p className="mt-1 text-[10px] text-neutral-500">Current stock: {product.stockQuantity}</p>}</div>
                <Input type="number" min="0.0001" step="0.0001" value={item.quantity} onChange={(e) => patchLine(index, { quantity: Number(e.target.value) })} />
                <select value={item.pricingMode} onChange={(e) => patchLine(index, { pricingMode: e.target.value as "UNIT" | "WEIGHT" })} className={selectClass}><option value="UNIT">Unit</option><option value="WEIGHT">Weight</option></select>
                <Input type="number" min="0" step="0.001" disabled={item.pricingMode !== "WEIGHT"} value={item.unitWeight ?? ""} onChange={(e) => patchLine(index, { unitWeight: Number(e.target.value) || null })} />
                <Input type="number" min="0" step="0.01" value={item.pricingMode === "WEIGHT" ? (item.perKgRate ?? 0) : item.unitPrice} onChange={(e) => item.pricingMode === "WEIGHT" ? patchLine(index, { perKgRate: Number(e.target.value) }) : patchLine(index, { unitPrice: Number(e.target.value) })} />
                <Input type="number" min="0" step="0.01" value={item.discountPerUnit} onChange={(e) => patchLine(index, { discountPerUnit: Number(e.target.value) })} />
                <Button type="button" variant="ghost" size="icon" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button>
              </div>;
            })}
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => setItems((current) => [...current, { productId: "", quantity: 1, pricingMode: "UNIT", unitWeight: null, perKgRate: null, unitPrice: 0, discountPerUnit: 0 }])}><Plus />Add line</Button>

        <Field label="Sale notes"><Input value={saleNotes} maxLength={500} onChange={(e) => setSaleNotes(e.target.value)} /></Field>

        <div className="ml-auto max-w-sm space-y-2 rounded-lg bg-neutral-50 p-4 text-sm">
          <Total label="Subtotal" value={totals.subtotal} /><Total label="Line discounts" value={-totals.lineDiscount} /><Total label="Order discount" value={-Math.max(0, orderDiscount || 0)} /><Total label="Taxable" value={totals.taxable} /><Total label={`GST (${gstRate || 0}%)`} value={totals.gst} /><div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{formatPKR(totals.total)}</span></div>
        </div>
        <div className="flex justify-end"><Button type="submit" disabled={financialPending}>{financialPending ? "Recalculating & saving..." : "Save full invoice edit"}</Button></div>
      </form>}
    </section>
  </div>;
}

function effectiveUnitPrice(item: InvoiceEditLine) { return item.pricingMode === "WEIGHT" ? Math.max(0, item.unitWeight || 0) * Math.max(0, item.perKgRate || 0) : Math.max(0, item.unitPrice || 0); }
const selectClass = "h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-neutral-600">{label}</span>{children}</label>; }
function Total({ label, value }: { label: string; value: number }) { return <div className="flex justify-between gap-4"><span className="text-neutral-500">{label}</span><span className="font-medium tabular-nums">{formatPKR(value)}</span></div>; }
