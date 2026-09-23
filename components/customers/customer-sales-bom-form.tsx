"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { saveCustomerSalesBomAction } from "@/app/(dashboard)/customers/[id]/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProductOption = { id: string; name: string; sku: string | null; unit: string };
type InitialConfig = {
  productId: string;
  productCode: string;
  components: Array<{ componentProductId: string; quantityPerUnit: number }>;
} | null;

type Row = { key: string; componentProductId: string; quantityPerUnit: string };

const selectClass = "h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";

function newRow(index: number): Row {
  return { key: `new-${Date.now()}-${index}`, componentProductId: "", quantityPerUnit: "1" };
}

export function CustomerSalesBomForm({
  customerId,
  products,
  initialConfig,
}: {
  customerId: string;
  products: ProductOption[];
  initialConfig: InitialConfig;
}) {
  const [productId, setProductId] = useState(initialConfig?.productId ?? "");
  const [productCode, setProductCode] = useState(initialConfig?.productCode ?? "");
  const [rows, setRows] = useState<Row[]>(
    initialConfig?.components.length
      ? initialConfig.components.map((component, index) => ({
          key: `${component.componentProductId}-${index}`,
          componentProductId: component.componentProductId,
          quantityPerUnit: String(component.quantityPerUnit),
        }))
      : [newRow(0)],
  );

  const selectedProduct = useMemo(() => products.find((product) => product.id === productId) ?? null, [productId, products]);

  function addRow() {
    setRows((current) => [...current, newRow(current.length)]);
  }

  function removeRow(key: string) {
    setRows((current) => current.length === 1 ? [newRow(0)] : current.filter((row) => row.key !== key));
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  return (
    <form action={saveCustomerSalesBomAction.bind(null, customerId)} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-xs font-medium">Sale product</span>
          <select name="productId" value={productId} onChange={(event) => setProductId(event.target.value)} className={selectClass} required>
            <option value="">Choose product</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium">Product code</span>
          <Input name="productCode" value={productCode} onChange={(event) => setProductCode(event.target.value.toUpperCase())} placeholder={selectedProduct ? "Auto generated if left blank" : "e.g. FHFF"} maxLength={30} />
          <span className="mt-1 block text-[11px] text-neutral-500">Example: Front Hub Full Floating can use FHFF. Leave blank to generate a code automatically.</span>
        </label>
      </div>

      <div className="rounded-lg border bg-neutral-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Accessories / components</h3>
            <p className="mt-0.5 text-xs text-neutral-500">These quantities are consumed for each 1 unit sold. Fractions such as 0.5 box are supported.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}><Plus className="mr-1 h-4 w-4" />Add component</Button>
        </div>

        <div className="mt-4 space-y-3">
          {rows.map((row, index) => (
            <div key={row.key} className="grid gap-2 rounded-md border bg-white p-3 sm:grid-cols-[minmax(0,1fr)_180px_40px] sm:items-end">
              <label>
                <span className="mb-1 block text-xs font-medium">Component {index + 1}</span>
                <select name="componentProductId" value={row.componentProductId} onChange={(event) => updateRow(row.key, { componentProductId: event.target.value })} className={selectClass} required>
                  <option value="">Choose inventory item</option>
                  {products.filter((product) => product.id !== productId).map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium">Qty per 1 product</span>
                <Input name="quantityPerUnit" type="number" min="0.0001" step="0.0001" value={row.quantityPerUnit} onChange={(event) => updateRow(row.key, { quantityPerUnit: event.target.value })} required />
              </label>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)} aria-label={`Remove component ${index + 1}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950">
        The customer invoice will still show only the sale product. Components are internal stock consumption and do not create extra invoice prices or lines.
      </div>

      <Button type="submit">Save product components</Button>
    </form>
  );
}
