"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { createOutboundGatePassDraftAction, updateOutboundGatePassDraftAction, type CreateOutboundGatePassState } from "@/app/(dashboard)/gate-passes/actions";

type Option = { id: string; name: string };
type ProductOption = Option & { sku: string; unit: string; stockQuantity: string };
type WarehouseOption = Option & { code: string };
type DraftLine = { key: number; productId: string; quantity: string };
type DraftPreset = {
  customerId: string; warehouseId: string; date: string;
  deliveryAddress: string; notes: string;
  items: Array<{ productId: string; quantity: string }>;
};

const initialState: CreateOutboundGatePassState = {};

export function OutboundGatePassDraftForm({
  customers,
  products,
  warehouses,
  managedWarehouse,
  idempotencyKey,
  editing,
  initialDraft,
}: {
  customers: Option[];
  products: ProductOption[];
  warehouses: WarehouseOption[];
  managedWarehouse: boolean;
  idempotencyKey: string;
  editing?: DraftPreset & { gatePassId: string; version: number };
  initialDraft?: DraftPreset;
}) {
  const preset = editing ?? initialDraft;
  const [state, formAction, pending] = useActionState(editing ? updateOutboundGatePassDraftAction : createOutboundGatePassDraftAction, initialState);
  const [lines, setLines] = useState<DraftLine[]>(()=>preset?.items.map((item,key)=>({...item,key}))??[{ key: 0, productId: "", quantity: "1" }]);
  const [nextKey, setNextKey] = useState(preset?.items.length??1);

  const itemsJson = JSON.stringify(lines.map((line) => ({ productId: line.productId, quantity: line.quantity })));
  const chosen = new Set(lines.map((line) => line.productId).filter(Boolean));
  const canSubmit = Boolean(idempotencyKey) && !pending && lines.length > 0
    && lines.every((line) => line.productId && line.quantity.trim() !== "")
    && chosen.size === lines.length;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {editing && <><input type="hidden" name="gatePassId" value={editing.gatePassId}/><input type="hidden" name="version" value={editing.version}/></>}
      <input type="hidden" name="itemsJson" value={itemsJson} readOnly />
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        Save creates a DRAFT only. It does not issue the Gate Pass. Open the saved draft and choose Issue Gate Pass after the stock and billing checks pass. Saving a draft does not move stock or create a sale. After issuing the gate pass,
        you can print an A4 or 80mm copy. For future V2 documents, stock is deducted once
        at ISSUE, subject to real stock checks and invoice-timing authorization. Printing is not authorization to dispatch;
        this document is not a tax invoice. Physical dispatch and accepted-goods invoicing
        require separately approved billing controls.
      </div>
      {state.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Customer</span>
          <select name="customerId" required defaultValue={preset?.customerId??""} className="w-full rounded-md border bg-background px-3 py-2">
            <option value="" disabled>Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Gate pass date</span>
          <input name="date" type="date" required defaultValue={preset?.date??new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Karachi" })} className="w-full rounded-md border bg-background px-3 py-2" />
        </label>
        {managedWarehouse && <label className="space-y-1 text-sm">
          <span className="font-medium">Source warehouse</span>
          <select name="warehouseId" defaultValue={preset?.warehouseId??""} required className="w-full rounded-md border bg-background px-3 py-2">
            <option value="" disabled>Select warehouse</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}
          </select>
        </label>}
        <label className="space-y-1 text-sm">
          <span className="font-medium">Delivery address</span>
          <input name="deliveryAddress" maxLength={500} defaultValue={preset?.deliveryAddress} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Destination company address" />
        </label>
      </div>

      <section className="space-y-3 rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Products and quantities</h2>
          <button type="button" disabled={pending || lines.length >= 100} className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50" onClick={() => {
            setLines((previous) => [...previous, { key: nextKey, productId: "", quantity: "1" }]);
            setNextKey((previous) => previous + 1);
          }}>Add product</button>
        </div>
        {lines.map((line, index) => (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_80px]">
            <label className="space-y-1 text-xs">
              <span>Product {index + 1}</span>
              <select value={line.productId} required className="w-full rounded-md border bg-background px-3 py-2 text-sm" onChange={(event) => {
                const value = event.target.value;
                setLines((previous) => previous.map((candidate) => candidate.key === line.key ? { ...candidate, productId: value } : candidate));
              }}>
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id} disabled={chosen.has(product.id) && product.id !== line.productId}>
                    {product.name} {product.sku ? "(" + product.sku + ")" : ""} · {product.unit}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1 text-xs">
              <label className="block space-y-1"><span>Quantity</span>
              <input required inputMode="decimal" type="text" value={line.quantity} className="w-full rounded-md border bg-background px-3 py-2 text-sm" onChange={(event) => {
                const value = event.target.value;
                setLines((previous) => previous.map((candidate) => candidate.key === line.key ? { ...candidate, quantity: value } : candidate));
              }} />
              </label>
              {(() => {
                const chosenProduct = products.find((product) => product.id === line.productId);
                if (!chosenProduct) return null;
                const available = Number(chosenProduct.stockQuantity);
                const insufficient = Number(line.quantity) > available && Number.isFinite(available);
                return <div className="text-xs text-muted-foreground">
                  Core available: {chosenProduct.stockQuantity} {chosenProduct.unit}.
                  {insufficient && <p role="alert" className="text-amber-800">Requested quantity exceeds current core stock. Additional stock is required for the full shipment.</p>}
                  {available > 0 && Number.isFinite(available) && <button
                    type="button" disabled={pending} className="mt-1 underline underline-offset-2"
                    onClick={() => setLines((previous) => previous.map((candidate) =>
                      candidate.key === line.key ? {...candidate, quantity: chosenProduct.stockQuantity} : candidate
                    ))}>Use core available quantity</button>}
                </div>;
              })()}
            </div>
            <div className="flex items-end">
              <button type="button" disabled={lines.length === 1 || pending} className="w-full rounded-md border px-2 py-2 text-xs disabled:opacity-50" onClick={() => {
                setLines((previous) => previous.filter((candidate) => candidate.key !== line.key));
              }}>Remove</button>
            </div>
          </div>
        ))}
      </section>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Notes</span>
        <textarea name="notes" maxLength={500} rows={3} defaultValue={preset?.notes} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Transport or delivery notes" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!canSubmit || customers.length === 0 || products.length === 0 || (managedWarehouse && warehouses.length === 0)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving draft..." : editing ? "Save draft changes" : "Save gate pass draft"}
        </button>
        <Link href="/gate-passes" className="text-sm underline underline-offset-4">Back to gate passes</Link>
      </div>
    </form>
  );
}
