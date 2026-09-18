"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackageCheck, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calculateAcceptedValue, expectedWeightKg } from "@/lib/grn-calculations";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import { formatPKR } from "@/lib/utils";

type POItem = { id: string; productId: string; productName: string; sku: string; orderedQuantity: number; receivedQuantity: number; remainingQuantity: number; unitCost: number; unitWeight: number | null; totalWeight: number | null; perKgRate: number | null; unit: string };
type ReceiptItem = { purchaseOrderItemId: string; receivedQuantity: string; acceptedQuantity: string; actualUnitCost: string; receivedWeightKg: string; acceptedWeightKg: string; ratePerKg: string };
type WarehouseOption = { id: string; name: string; code: string; isDefault: boolean };
type GrnDraft = { version: 2; savedAt: string; receiptDate: string; receivedBy: string; checkedBy: string; notes: string; warehouseId: string; receipts: ReceiptItem[] };
const fieldClass = "h-8 w-full rounded-md border bg-white px-2.5 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
const receivingGrid = "grid-cols-[minmax(190px,1fr)_65px_70px_70px_82px_82px_96px_96px_92px_110px]";

function initialReceiptItems(items: POItem[]): ReceiptItem[] {
  return items.map((item) => ({
    purchaseOrderItemId: item.id,
    receivedQuantity: "",
    acceptedQuantity: "",
    actualUnitCost: String(item.unitCost),
    receivedWeightKg: "",
    acceptedWeightKg: "",
    ratePerKg: item.perKgRate != null ? String(item.perKgRate) : "",
  }));
}

export function GoodsReceiptForm({
  purchaseOrderId,
  poNumber,
  supplierName,
  items,
  warehouseMode = "LEGACY",
  warehouses = [],
}: {
  purchaseOrderId: string;
  poNumber: string;
  supplierName: string;
  items: POItem[];
  warehouseMode?: "LEGACY" | "MANAGED";
  warehouses?: WarehouseOption[];
}) {
  const router = useRouter();
  const initialReceipts = useMemo(() => initialReceiptItems(items), [items]);
  const draftKey = `munshios:grn-draft:${purchaseOrderId}`;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [receiptDate, setReceiptDate] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [notes, setNotes] = useState("");
  const initialWarehouseId = warehouseMode === "MANAGED"
    ? (warehouses.find((warehouse) => warehouse.isDefault)?.id ?? "")
    : "";
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [receipts, setReceipts] = useState<ReceiptItem[]>(initialReceipts);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw) as Partial<GrnDraft>;
          if (draft.version === 2 && Array.isArray(draft.receipts)) {
            const savedById = new Map(draft.receipts.map((entry) => [entry.purchaseOrderItemId, entry]));
            setReceipts(initialReceipts.map((entry) => savedById.get(entry.purchaseOrderItemId) ?? entry));
            setReceiptDate(typeof draft.receiptDate === "string" ? draft.receiptDate : "");
            setReceivedBy(typeof draft.receivedBy === "string" ? draft.receivedBy : "");
            setCheckedBy(typeof draft.checkedBy === "string" ? draft.checkedBy : "");
            setNotes(typeof draft.notes === "string" ? draft.notes : "");
            if (warehouseMode === "MANAGED" && typeof draft.warehouseId === "string" && warehouses.some((warehouse) => warehouse.id === draft.warehouseId)) {
              setWarehouseId(draft.warehouseId);
            }
          }
        }
      } catch {
        window.localStorage.removeItem(draftKey);
      } finally {
        setHydrated(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftKey, initialReceipts, warehouseMode, warehouses]);

  const isDirty = receiptDate !== "" || receivedBy !== "" || checkedBy !== "" || notes !== "" || warehouseId !== initialWarehouseId || JSON.stringify(receipts) !== JSON.stringify(initialReceipts);

  useEffect(() => {
    if (!hydrated) return;
    if (!isDirty) {
      window.localStorage.removeItem(draftKey);
      return;
    }
    const draft: GrnDraft = { version: 2, savedAt: new Date().toISOString(), receiptDate, receivedBy, checkedBy, notes, warehouseId, receipts };
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [checkedBy, draftKey, hydrated, isDirty, notes, receiptDate, receivedBy, receipts, warehouseId]);

  useUnsavedChangesGuard(hydrated && isDirty && !busy, "This GRN is still in progress. Leave this page? Your draft is saved on this device, but it has not been posted.");

  function discardDraft() {
    if (!window.confirm("Discard this saved GRN draft and reset the form?")) return;
    setReceiptDate("");
    setReceivedBy("");
    setCheckedBy("");
    setNotes("");
    setWarehouseId(initialWarehouseId);
    setReceipts(initialReceipts);
    window.localStorage.removeItem(draftKey);
  }

  function updateReceipt(index: number, field: keyof ReceiptItem, value: string) {
    setReceipts((current) => current.map((receipt, receiptIndex) => {
      if (receiptIndex !== index) return receipt;
      const item = items[index];
      const updated = { ...receipt, [field]: value };
      if (field === "receivedQuantity") {
        updated.acceptedQuantity = value;
        if (item?.perKgRate != null) {
          const weight = expectedWeightKg(value, item.unit, item.unitWeight);
          updated.receivedWeightKg = weight;
          updated.acceptedWeightKg = weight;
        }
      }
      if (field === "acceptedQuantity" && item?.perKgRate != null) updated.acceptedWeightKg = expectedWeightKg(value, item.unit, item.unitWeight);
      return updated;
    }));
  }

  const acceptedValue = (receipt: ReceiptItem, item: POItem) => calculateAcceptedValue({
    isWeightPriced: item.perKgRate != null,
    acceptedQuantity: receipt.acceptedQuantity,
    actualUnitCost: receipt.actualUnitCost,
    acceptedWeightKg: receipt.acceptedWeightKg,
    ratePerKg: receipt.ratePerKg,
  });

  const computeTotal = () => receipts.reduce((sum, receipt, index) => sum + (acceptedValue(receipt, items[index]) ?? 0), 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const selected = receipts.filter((receipt) => Number(receipt.receivedQuantity) > 0);
    if (!selected.length) { setMessage("Receive at least one item."); setBusy(false); return; }
    if (warehouseMode === "MANAGED" && !warehouseId) { setMessage("Choose a receiving warehouse."); setBusy(false); return; }

    for (const receipt of selected) {
      const item = items.find((entry) => entry.id === receipt.purchaseOrderItemId)!;
      if (item.perKgRate == null) continue;
      const receivedWeight = Number(receipt.receivedWeightKg);
      const acceptedWeight = Number(receipt.acceptedWeightKg);
      const rate = Number(receipt.ratePerKg);
      if (!receipt.receivedWeightKg || !receipt.ratePerKg || receivedWeight <= 0 || rate <= 0) { setMessage(`${item.productName}: enter received weight and a rate per kg greater than zero.`); setBusy(false); return; }
      if (Number(receipt.acceptedQuantity) > 0 && (!receipt.acceptedWeightKg || acceptedWeight <= 0)) { setMessage(`${item.productName}: enter accepted weight greater than zero.`); setBusy(false); return; }
      if (acceptedWeight > receivedWeight) { setMessage(`${item.productName}: accepted weight cannot exceed received weight.`); setBusy(false); return; }
    }

    const itemsPayload = selected.map((receipt) => {
      const item = items.find((entry) => entry.id === receipt.purchaseOrderItemId)!;
      const payload: Record<string, unknown> = { purchaseOrderItemId: receipt.purchaseOrderItemId, receivedQuantity: Number(receipt.receivedQuantity), acceptedQuantity: Number(receipt.acceptedQuantity), actualUnitCost: Number(receipt.actualUnitCost) };
      if (item.perKgRate != null) { payload.receivedWeightKg = Number(receipt.receivedWeightKg); payload.acceptedWeightKg = Number(receipt.acceptedWeightKg); payload.ratePerKg = Number(receipt.ratePerKg); }
      return payload;
    });

    try {
      const response = await fetch("/api/v1/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          purchaseOrderId,
          receiptDate: receiptDate || undefined,
          notes,
          receivedBy,
          checkedBy,
          warehouseId: warehouseMode === "MANAGED" ? warehouseId : undefined,
          items: itemsPayload,
        }),
      });
      const body = await response.json();
      if (response.ok && body.data?.id) {
        window.localStorage.removeItem(draftKey);
        setHydrated(false);
        router.push(`/goods-receipts/${body.data.id}`);
        router.refresh();
        return;
      }
      setMessage(body.error?.message ?? "Could not post goods receipt.");
    } catch {
      setMessage("Network error. Please try again.");
    }
    setBusy(false);
  }

  if (!items.length) return <div className="rounded-md border bg-white p-10 text-center"><PackageCheck className="mx-auto size-5 text-slate-400" /><p className="mt-3 text-sm font-semibold">No quantities remain to receive</p><p className="mt-1 text-xs text-slate-500">Return to the purchase order to review its receipt history.</p></div>;

  return <form onSubmit={submit} className="space-y-4">
    {isDirty && hydrated && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"><span><strong>Draft autosaved.</strong> If you open Sales or another page by mistake, your GRN can be restored when you come back on this device.</span><Button type="button" variant="ghost" size="sm" onClick={discardDraft}><RotateCcw className="size-3.5" />Discard draft</Button></div>}

    <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Receipt Document</CardTitle></CardHeader><CardContent className="grid gap-4 p-4 md:grid-cols-5"><DocumentFact label="PO Reference" value={poNumber} mono /><DocumentFact label="Supplier" value={supplierName} /><Field label="Receipt date"><Input name="receiptDate" type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} /></Field><Field label="Received by"><Input name="receivedBy" placeholder="Name" value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} /></Field><Field label="Checked by"><Input name="checkedBy" placeholder="Name" value={checkedBy} onChange={(event) => setCheckedBy(event.target.value)} /></Field>{warehouseMode === "MANAGED" ? <Field label="Receiving warehouse"><select name="warehouseId" required value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className={fieldClass}><option value="">Choose warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.code}{warehouse.isDefault ? " · Default" : ""}</option>)}</select></Field> : null}</CardContent></Card>

    <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Receiving Lines</CardTitle><p className="text-[11px] text-slate-500">Accepted quantity updates inventory. For weight-priced items, supplier liability = accepted weight (kg) × rate/kg.</p></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><div className="min-w-[1060px]">
      <div className={`grid ${receivingGrid} gap-2 border-b bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500`}><span>Product</span><span className="text-right">Ordered</span><span className="text-right">Prev. accepted</span><span className="text-right">Remaining</span><span className="text-right">Received qty</span><span className="text-right">Accepted qty</span><span className="text-right">Received kg</span><span className="text-right">Accepted kg</span><span className="text-right">Rate</span><span className="text-right">Accepted value</span></div>
      {items.map((item, index) => {
        const receipt = receipts[index];
        const received = Number(receipt?.receivedQuantity) || 0;
        const accepted = Number(receipt?.acceptedQuantity) || 0;
        const overRemaining = received > item.remainingQuantity;
        const unit = item.unit === "KG" ? "kg" : item.unit.toLowerCase();
        const isWeighted = item.perKgRate != null;
        const value = acceptedValue(receipt, item);
        return <div key={item.id} className={`grid ${receivingGrid} items-start gap-2 border-b px-4 py-2.5 last:border-0`}>
          <div><p className="text-xs font-medium text-slate-900">{item.productName}</p><p className="font-mono text-[10px] text-slate-500">{item.sku || "No SKU"} · inventory unit: {unit}</p>{isWeighted && <p className="text-[10px] text-slate-500">PO basis: {item.unitWeight ?? "-"} kg/{unit} at {formatPKR(item.perKgRate!)}/kg</p>}</div>
          <Quantity value={item.orderedQuantity} unit={unit} /><Quantity value={item.receivedQuantity} unit={unit} /><Quantity value={item.remainingQuantity} unit={unit} strong />
          <div><Input aria-label={`${item.productName} received quantity`} type="number" min="0" step={item.unit === "KG" ? "0.001" : "1"} max={item.remainingQuantity} value={receipt?.receivedQuantity || ""} onChange={(event) => updateReceipt(index, "receivedQuantity", event.target.value)} className={`text-right text-xs ${overRemaining ? "border-red-500" : ""}`} />{overRemaining && <p className="mt-1 text-right text-[9px] text-red-600">Max {item.remainingQuantity}</p>}</div>
          <div><Input aria-label={`${item.productName} accepted quantity`} type="number" min="0" step={item.unit === "KG" ? "0.001" : "1"} max={received} value={receipt?.acceptedQuantity || ""} onChange={(event) => updateReceipt(index, "acceptedQuantity", event.target.value)} className="text-right text-xs" />{received > accepted && <p className="mt-1 text-right text-[9px] text-amber-700">Rejected {received - accepted} {unit}</p>}</div>
          {isWeighted ? <Input aria-label={`${item.productName} received weight kg`} type="number" min="0" step="0.001" value={receipt?.receivedWeightKg || ""} onChange={(event) => updateReceipt(index, "receivedWeightKg", event.target.value)} className="text-right text-xs" /> : <Dash />}
          {isWeighted ? <Input aria-label={`${item.productName} accepted weight kg`} type="number" min="0" step="0.001" max={Number(receipt?.receivedWeightKg) || undefined} value={receipt?.acceptedWeightKg || ""} onChange={(event) => updateReceipt(index, "acceptedWeightKg", event.target.value)} className="text-right text-xs" /> : <Dash />}
          {isWeighted ? <FieldWithUnit unit="/kg"><Input aria-label={`${item.productName} rate per kg`} type="number" min="0.01" step="0.01" value={receipt?.ratePerKg || ""} onChange={(event) => updateReceipt(index, "ratePerKg", event.target.value)} className="text-right text-xs" /></FieldWithUnit> : <FieldWithUnit unit={`/${unit}`}><Input aria-label={`${item.productName} cost per ${unit}`} type="number" min="0" step="0.01" value={receipt?.actualUnitCost || ""} onChange={(event) => updateReceipt(index, "actualUnitCost", event.target.value)} className="text-right text-xs" /></FieldWithUnit>}
          <div className="flex h-8 items-center justify-end text-xs font-semibold tabular-nums">{value == null ? <span className="text-[10px] font-normal text-amber-700">Complete weight fields</span> : formatPKR(value)}</div>
        </div>;
      })}
    </div></div></CardContent></Card>

    <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]"><Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Receipt Notes</CardTitle></CardHeader><CardContent className="p-4"><textarea name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Condition, delivery, or quality-control notes" rows={3} className={`${fieldClass} h-auto resize-y py-2`} maxLength={1000} /></CardContent></Card><Card className="gap-0 rounded-md border py-0 shadow-none ring-0 2xl:sticky 2xl:top-6"><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">Accepted GRN value</span><span className="text-lg font-semibold tabular-nums">{formatPKR(computeTotal())}</span></div><div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[10px] leading-relaxed text-amber-900"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />Posting updates inventory, supplier payable, PO receiving, and the General Ledger.</div>{message && <p role="alert" className="text-xs text-red-600">{message}</p>}<Button disabled={busy} type="submit" className="w-full">{busy ? "Posting..." : "Post Goods Receipt"}</Button></CardContent></Card></div>
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>{children}</label>; }
function DocumentFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><p className="text-xs font-medium text-slate-700">{label}</p><p className={`mt-1 flex h-8 items-center rounded-md border bg-slate-50 px-2.5 text-xs ${mono ? "font-mono font-semibold" : "font-medium"}`}>{value}</p></div>; }
function Quantity({ value, unit, strong = false }: { value: number; unit: string; strong?: boolean }) { return <div className={`flex h-8 items-center justify-end text-xs tabular-nums ${strong ? "font-semibold" : "text-slate-600"}`}>{value} <span className="ml-1 text-[10px] text-slate-400">{unit}</span></div>; }
function Dash() { return <div className="flex h-8 items-center justify-end text-xs text-slate-300">-</div>; }
function FieldWithUnit({ unit, children }: { unit: string; children: React.ReactNode }) { return <div><div>{children}</div><p className="mt-1 text-right text-[9px] text-slate-500">PKR{unit}</p></div>; }
