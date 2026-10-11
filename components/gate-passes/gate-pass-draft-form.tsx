"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { createOutboundGatePassDraftAction, type CreateOutboundGatePassState } from "@/app/(dashboard)/gate-passes/actions";

type Option = { id: string; name: string };
type ProductOption = Option & { sku: string; unit: string; stockQuantity: string };
type WarehouseOption = Option & { code: string };
type DraftLine = { key: number; productId: string; quantity: string };

const initialState: CreateOutboundGatePassState = {};

export function OutboundGatePassDraftForm({
  customers,
  products,
  warehouses,
  managedWarehouse,
}: {
  customers: Option[];
  products: ProductOption[];
  warehouses: WarehouseOption[];
  managedWarehouse: boolean;
}) {
  const [state, formAction, pending] = useActionState(createOutboundGatePassDraftAction, initialState);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ key: 0, productId: "", quantity: "1" }]);
  const [nextKey, setNextKey] = useState(1);

  useEffect(() => { setIdempotencyKey(crypto.randomUUID()); }, []);
  const itemsJson = JSON.stringify(lines.map((line) => ({ productId: line.productId, quantity: line.quantity })));
  const chosen = new Set(lines.map((line) => line.productId).filter(Boolean));
  const canSubmit = Boolean(idempotencyKey) && !pending && lines.length > 0
    && lines.every((line) => line.productId && line.quantity.trim() !== "")
    && chosen.size === lines.length;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="itemsJson" value={itemsJson} readOnly />
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        Draft capture only. No stock is reserved or dispatched. Printing for physical dispatch,
        receiving and commercial invoicing remain locked until their controls are certified.
      </div>
      {state.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Customer</span>
          <select name="customerId" required defaultValue="" className="w-full rounded-md border bg-background px-3 py-2">
            <option value="" disabled>Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Gate pass date</span>
          <input name="date" type="date" required defaultValue={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Karachi" })} className="w-full rounded-md border bg-background px-3 py-2" />
        </label>
        {managedWarehouse && <label className="space-y-1 text-sm">
          <span className="font-medium">Source warehouse</span>
          <select name="warehouseId" defaultValue="" required className="w-full rounded-md border bg-background px-3 py-2">
            <option value="" disabled>Select warehouse</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}
          </select>
        </label>}
        <label className="space-y-1 text-sm">
          <span className="font-medium">Delivery address</span>
          <input name="deliveryAddress" maxLength={500} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Destination company address" />
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
          <div key={line.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_80px]">
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
            <label className="space-y-1 text-xs">
              <span>Quantity</span>
              <input required inputMode="decimal" type="text" value={line.quantity} className="w-full rounded-md border bg-background px-3 py-2 text-sm" onChange={(event) => {
                const value = event.target.value;
                setLines((previous) => previous.map((candidate) => candidate.key === line.key ? { ...candidate, quantity: value } : candidate));
              }} />
            </label>
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
        <textarea name="notes" maxLength={500} rows={3} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Transport or delivery notes" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!canSubmit || customers.length === 0 || products.length === 0 || (managedWarehouse && warehouses.length === 0)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving draft..." : "Save gate pass draft"}
        </button>
        <Link href="/gate-passes" className="text-sm underline underline-offset-4">Back to gate passes</Link>
      </div>
    </form>
  );
}
