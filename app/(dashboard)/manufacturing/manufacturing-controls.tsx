"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  createBomAction,
  createProductionRunAction,
  createWarehouseAction,
  initialManufacturingActionState,
} from "@/app/(dashboard)/manufacturing/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ProductOption = { id: string; name: string; sku: string };
type BomOption = { id: string; name: string; version: number };
type MaterialRow = { materialProductId: string; quantity: string; wastagePercent: string };

export function ManufacturingControls({
  products,
  boms,
  canManage,
}: {
  products: ProductOption[];
  boms: BomOption[];
  canManage: boolean;
}) {
  const [warehouseState, warehouseAction, warehousePending] = useActionState(createWarehouseAction, initialManufacturingActionState);
  const [bomState, bomAction, bomPending] = useActionState(createBomAction, initialManufacturingActionState);
  const [runState, runAction, runPending] = useActionState(createProductionRunAction, initialManufacturingActionState);
  const [materials, setMaterials] = useState<MaterialRow[]>([{ materialProductId: "", quantity: "1", wastagePercent: "0" }]);

  const itemsJson = useMemo(
    () => JSON.stringify(materials.map((row) => ({
      materialProductId: row.materialProductId,
      quantity: Number(row.quantity),
      wastagePercent: Number(row.wastagePercent),
    }))),
    [materials],
  );

  function updateMaterial(index: number, patch: Partial<MaterialRow>) {
    setMaterials((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-md border shadow-none ring-0">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Warehouse setup</h2>
            <p className="mt-1 text-xs text-muted-foreground">Create inventory locations used by manufacturing.</p>
            {canManage ? (
              <form action={warehouseAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Warehouse name"><Input name="name" placeholder="Main warehouse" maxLength={100} required /></Field>
                <Field label="Code"><Input name="code" placeholder="WH-MAIN" maxLength={24} required /></Field>
                <Field label="Address"><Input name="address" placeholder="Optional address" maxLength={250} /></Field>
                <label className="flex items-end gap-2 pb-2 text-xs font-medium"><input name="isDefault" type="checkbox" className="size-4" />Set as default</label>
                <div className="sm:col-span-2 flex items-center justify-between gap-3"><ActionMessage state={warehouseState} /><Button type="submit" disabled={warehousePending}>{warehousePending ? "Adding..." : "Add warehouse"}</Button></div>
              </form>
            ) : <p className="mt-4 text-sm text-muted-foreground">Only an owner, admin, or manager can add warehouses.</p>}
          </CardContent>
        </Card>

        <Card className="rounded-md border shadow-none ring-0">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">New production run</h2>
            <p className="mt-1 text-xs text-muted-foreground">Creates a draft run. Approval and posting remain separate controlled steps.</p>
            <form action={runAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="BOM">
                <select name="bomId" required className={selectClass} defaultValue="">
                  <option value="" disabled>Select BOM</option>
                  {boms.map((bom) => <option key={bom.id} value={bom.id}>{bom.name} · v{bom.version}</option>)}
                </select>
              </Field>
              <Field label="Run number"><Input name="runNumber" placeholder="RUN-0001" maxLength={80} required /></Field>
              <Field label="Planned output"><Input name="plannedOutput" type="number" min="0.0001" step="0.0001" required /></Field>
              <Field label="Notes"><Input name="notes" placeholder="Optional notes" maxLength={500} /></Field>
              <div className="sm:col-span-2 flex items-center justify-between gap-3"><ActionMessage state={runState} /><Button type="submit" disabled={runPending || boms.length === 0}>{runPending ? "Creating..." : "Create draft run"}</Button></div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-md border shadow-none ring-0">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold">BOM builder</h2>
          <p className="mt-1 text-xs text-muted-foreground">Define finished output and all raw-material requirements. Duplicate material rows are rejected.</p>
          {canManage ? (
            <form action={bomAction} className="mt-4 space-y-4">
              <input type="hidden" name="itemsJson" value={itemsJson} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="BOM name"><Input name="name" placeholder="Standard assembly" maxLength={120} required /></Field>
                <Field label="Finished product">
                  <select name="finishedProductId" required className={selectClass} defaultValue="">
                    <option value="" disabled>Select product</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}
                  </select>
                </Field>
                <Field label="Output quantity"><Input name="outputQuantity" type="number" min="0.0001" step="0.0001" defaultValue={1} required /></Field>
                <Field label="Version"><Input name="version" type="number" min={1} step={1} defaultValue={1} required /></Field>
              </div>
              <Field label="Notes"><Input name="notes" placeholder="Optional BOM notes" maxLength={500} /></Field>

              <div className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                  <p className="text-xs font-semibold">Raw materials</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setMaterials((rows) => [...rows, { materialProductId: "", quantity: "1", wastagePercent: "0" }])} disabled={materials.length >= 100}><Plus />Add row</Button>
                </div>
                <div className="divide-y">
                  {materials.map((row, index) => (
                    <div key={index} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_140px_140px_36px]">
                      <select required value={row.materialProductId} onChange={(event) => updateMaterial(index, { materialProductId: event.target.value })} className={selectClass}>
                        <option value="" disabled>Select raw material</option>
                        {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}
                      </select>
                      <Input aria-label="Material quantity" type="number" min="0.0001" step="0.0001" value={row.quantity} onChange={(event) => updateMaterial(index, { quantity: event.target.value })} required />
                      <Input aria-label="Wastage percent" type="number" min={0} max={100} step="0.01" value={row.wastagePercent} onChange={(event) => updateMaterial(index, { wastagePercent: event.target.value })} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove material" disabled={materials.length === 1} onClick={() => setMaterials((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 /></Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3"><ActionMessage state={bomState} /><Button type="submit" disabled={bomPending || products.length < 2}>{bomPending ? "Creating..." : "Create BOM"}</Button></div>
            </form>
          ) : <p className="mt-4 text-sm text-muted-foreground">Only an owner, admin, or manager can create BOMs.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

const selectClass = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5 text-xs font-medium"><span>{label}</span>{children}</label>;
}

function ActionMessage({ state }: { state: { status: "idle" | "success" | "error"; message: string } }) {
  if (!state.message) return <span />;
  return <p className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-emerald-700"}>{state.message}</p>;
}
