"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, RefreshCw } from "lucide-react";
import { startTransition, useEffect, useRef, useActionState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  createProductAction,
  loadFbrReferenceOptionsAction,
  type FbrReferenceOptionsState,
  updateProductAction,
} from "@/app/(dashboard)/inventory/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { productSchema, type ProductEditInput, type ProductInput } from "@/lib/validation/product";

type ProductFormInput = ProductInput;
type ProductFormValues = z.output<typeof productSchema>;

const fieldClass = "space-y-1.5";
const labelClass = "text-sm font-medium text-neutral-800";
const errorClass = "text-xs text-red-600";
const DRAFT_KEY = "businessos-product-draft";

type ProductFormProps = {
  product?: ProductEditInput & { id: string };
};

export function ProductForm({ product }: ProductFormProps) {
  const action = product ? updateProductAction.bind(null, product.id) : createProductAction;
  const [actionState, formAction, isPending] = useActionState(action, {});
  const [referenceState, loadReferenceAction, referencePending] = useActionState(
    loadFbrReferenceOptionsAction,
    {} as FbrReferenceOptionsState,
  );
  const { control, register, handleSubmit, reset, formState: { errors, isSubmitSuccessful } } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product ? { ...product, stockQuantity: 0 } : { unit: "PIECE", stockQuantity: 0, reorderLevel: 10 },
  });
  const selectedUnit = useWatch({ control, name: "unit" });
  const selectedFbrTransactionTypeId = useWatch({ control, name: "fbrTransactionTypeId" });
  const isKgMode = selectedUnit === "KG";
  const qtyStep = isKgMode ? "0.01" : "1";
  const allValues = useWatch({ control });
  const draftKey = product ? `${DRAFT_KEY}-${product.id}` : DRAFT_KEY;
  const restoreRef = useRef(false);

  useEffect(() => {
    if (product) return;
    if (restoreRef.current) return;
    restoreRef.current = true;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        reset(parsed, { keepDefaultValues: false });
      }
    } catch {}
  }, [draftKey, product, reset]);

  useEffect(() => {
    if (product || isSubmitSuccessful) return;
    const timeout = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(allValues)); } catch {}
    }, 500);
    return () => clearTimeout(timeout);
  }, [allValues, draftKey, product, isSubmitSuccessful]);

  useEffect(() => {
    if (isSubmitSuccessful) {
      try { localStorage.removeItem(draftKey); } catch {}
    }
  }, [isSubmitSuccessful, draftKey]);

  function submit(values: ProductFormValues) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== null) formData.set(key, String(value)); });
    startTransition(() => formAction(formData));
  }


  function loadFbrReferences() {
    const formData = new FormData();
    const transactionTypeId = Number(selectedFbrTransactionTypeId);
    if (Number.isInteger(transactionTypeId) && transactionTypeId > 0) {
      formData.set("transactionTypeId", String(transactionTypeId));
    }
    startTransition(() => loadReferenceAction(formData));
  }

  const currentRateOptions = referenceState.rateTransactionTypeId === Number(selectedFbrTransactionTypeId)
    ? (referenceState.rates ?? [])
    : [];

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="border-b px-5 py-4">
          <CardTitle>Product information</CardTitle>
          <p className="text-xs text-neutral-500">{product ? "Update catalog and pricing details. Use stock adjustment to change quantity." : "Pricing is recorded in PKR. Kg products accept decimal quantities."}</p>
        </CardHeader>
        <CardContent className="grid gap-x-5 gap-y-4 px-5 py-5 md:grid-cols-2">
          <div className="md:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Catalog identity</p></div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="name">Product name</label>
            <Input id="name" placeholder="e.g. Front Hub 150cc" aria-invalid={!!errors.name} {...register("name")} />
            {errors.name && <p className={errorClass}>{errors.name.message}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="sku">SKU</label>
            <Input id="sku" placeholder="HUB-150-STD" className="font-mono uppercase" aria-invalid={!!errors.sku} {...register("sku")} />
            {errors.sku && <p className={errorClass}>{errors.sku.message}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="category">Category</label>
            <Input id="category" placeholder="Hubs" aria-invalid={!!errors.category} {...register("category")} />
            {errors.category && <p className={errorClass}>{errors.category.message}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="unit">Unit</label>
            <select id="unit" className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50" {...register("unit")}>
              <option value="PIECE">Piece</option><option value="BOX">Box</option><option value="CARTON">Carton</option><option value="KG">Kg</option><option value="SET">Set</option><option value="LITER">Liter</option><option value="METER">Meter</option>
            </select>
          </div>
          {product && <div className={fieldClass}><label className={labelClass} htmlFor="status">Status</label><select id="status" className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" {...register("status")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select></div>}
          <div className="border-t pt-4 md:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">FBR Digital Invoicing mapping</p>
                <p className="mt-1 text-xs text-neutral-500">Optional for inventory use. Load official sandbox references instead of guessing transaction, UOM, or rate IDs.</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={loadFbrReferences} disabled={referencePending}>
                <RefreshCw className={referencePending ? "animate-spin" : ""} />
                {referencePending ? "Loading FBR..." : selectedFbrTransactionTypeId ? "Refresh FBR refs & rates" : "Load FBR references"}
              </Button>
            </div>
            {referenceState.message && (
              <div
                role={referenceState.status === "error" ? "alert" : "status"}
                className={"mt-3 rounded-lg border p-3 text-xs leading-5 " + (referenceState.status === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800")}
              >
                <p>{referenceState.message}</p>
                {referenceState.status === "success" && referenceState.province && (
                  <p className="mt-1 font-medium">Seller province: {referenceState.province.description} (#{referenceState.province.code}) · effective {referenceState.effectiveDate}</p>
                )}
              </div>
            )}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="fbrHsCode">HS code</label>
            <Input id="fbrHsCode" placeholder="e.g. 0101.2100" aria-invalid={!!errors.fbrHsCode} {...register("fbrHsCode")} />
            {errors.fbrHsCode && <p className={errorClass}>{errors.fbrHsCode.message}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="fbrUom">FBR unit of measurement</label>
            <Input id="fbrUom" list="fbr-uom-options" placeholder="e.g. Numbers, pieces, units" aria-invalid={!!errors.fbrUom} {...register("fbrUom")} />
            <p className="text-[11px] text-neutral-500">Use the description returned by the FBR UOM reference API.</p>
            {errors.fbrUom && <p className={errorClass}>{errors.fbrUom.message}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="fbrTransactionTypeId">FBR transaction type ID</label>
            <Input id="fbrTransactionTypeId" list="fbr-transaction-type-options" type="number" min="1" step="1" placeholder="Choose from loaded FBR transaction types" aria-invalid={!!errors.fbrTransactionTypeId} {...register("fbrTransactionTypeId", { setValueAs: (value) => value === "" ? undefined : Number(value) })} />
            <p className="text-[11px] text-neutral-500">The official sale type description is fetched by MunshiOS during verification; it is not trusted from browser text.</p>
            {errors.fbrTransactionTypeId && <p className={errorClass}>{errors.fbrTransactionTypeId.message}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="fbrRateId">FBR rate ID</label>
            <Input id="fbrRateId" list="fbr-rate-options" type="number" min="1" step="1" placeholder={selectedFbrTransactionTypeId ? "Choose from current FBR rates" : "Select a transaction type, then refresh"} aria-invalid={!!errors.fbrRateId} {...register("fbrRateId", { setValueAs: (value) => value === "" ? undefined : Number(value) })} />
            <p className="text-[11px] text-neutral-500">Validated against invoice-date rate rules for the seller province before production use.</p>
            {errors.fbrRateId && <p className={errorClass}>{errors.fbrRateId.message}</p>}
          </div>
          <div className="md:col-span-2">
            <datalist id="fbr-uom-options">
              {(referenceState.uoms ?? []).map((entry) => <option key={entry.id} value={entry.description} label={`#${entry.id}`} />)}
            </datalist>
            <datalist id="fbr-transaction-type-options">
              {(referenceState.transactionTypes ?? []).map((entry) => <option key={entry.id} value={String(entry.id)} label={entry.description} />)}
            </datalist>
            <datalist id="fbr-rate-options">
              {currentRateOptions.map((entry) => <option key={entry.id} value={String(entry.id)} label={`${entry.description}${entry.plainPercentage ? "" : " · compound/unsupported"}`} />)}
            </datalist>
            {selectedFbrTransactionTypeId && referenceState.status === "success" && referenceState.rateTransactionTypeId !== Number(selectedFbrTransactionTypeId) && (
              <p className="text-[11px] text-amber-700">Transaction type changed after the last reference load. Refresh FBR references before choosing a rate.</p>
            )}
            {currentRateOptions.some((entry) => !entry.plainPercentage) && (
              <p className="mt-1 text-[11px] text-amber-700">Compound rates may appear in the official list but remain blocked from production submission until their calculation rules are implemented.</p>
            )}
          </div>
          {product && (
            <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Saving any HS code, UOM, transaction type or rate-ID change invalidates prior FBR verification. Save first, then verify the mapping from the product details page.
            </div>
          )}
          <div className="border-t pt-4 md:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pricing and stock controls</p></div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="costPrice">Cost price</label>
            <Input id="costPrice" type="number" min="0" step="1" placeholder="0" aria-invalid={!!errors.costPrice} {...register("costPrice")} />
            {errors.costPrice && <p className={errorClass}>{errors.costPrice.message}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="sellingPrice">Selling price / default rate</label>
            <Input id="sellingPrice" type="number" min="1" step="1" placeholder="0" aria-invalid={!!errors.sellingPrice} {...register("sellingPrice")} />
            <p className="text-[11px] text-neutral-500">Used as unit price normally, or as the suggested rate/kg for weight-priced sales.</p>
            {errors.sellingPrice && <p className={errorClass}>{errors.sellingPrice.message}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="defaultWeightKg">Default weight per {selectedUnit?.toLowerCase() || "unit"} (kg)</label>
            <Input id="defaultWeightKg" type="number" min="0.001" step="0.001" placeholder="Optional, e.g. 4.500" aria-invalid={!!errors.defaultWeightKg} {...register("defaultWeightKg", { setValueAs: (value) => value === "" ? undefined : Number(value) })} />
            <p className="text-[11px] text-neutral-500">Suggestion only. PO, GRN and sales transactions can override the actual weight every time.</p>
            {errors.defaultWeightKg && <p className={errorClass}>{errors.defaultWeightKg.message}</p>}
          </div>
          {!product && <div className={fieldClass}>
            <label className={labelClass} htmlFor="stockQuantity">Opening stock{isKgMode ? " (kg)" : ""}</label>
            <Input id="stockQuantity" type="number" min="0" step={qtyStep} aria-invalid={!!errors.stockQuantity} {...register("stockQuantity")} />
            {errors.stockQuantity && <p className={errorClass}>{errors.stockQuantity.message}</p>}
          </div>}
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="reorderLevel">Reorder level{isKgMode ? " (kg)" : ""}</label>
            <Input id="reorderLevel" type="number" min="0" step={qtyStep} aria-invalid={!!errors.reorderLevel} {...register("reorderLevel")} />
            {errors.reorderLevel && <p className={errorClass}>{errors.reorderLevel.message}</p>}
          </div>
          <div className="border-t pt-4 md:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Product notes</p></div>
          <div className={`${fieldClass} md:col-span-2`}>
            <label className={labelClass} htmlFor="description">Description</label>
            <textarea id="description" rows={4} placeholder="Compatibility, specifications, or handling notes..." aria-invalid={!!errors.description} className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/50 aria-invalid:border-red-500" {...register("description")} />
            {errors.description && <p className={errorClass}>{errors.description.message}</p>}
          </div>
          {actionState.error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 md:col-span-2" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {actionState.error}
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-end gap-2 border-t px-5 py-4">
          <Link href={product ? `/inventory/${product.id}` : "/inventory"} onClick={() => { try { localStorage.removeItem(draftKey); } catch {} }} className={buttonVariants({ variant: "outline", size: "sm" })}>Cancel</Link>
          <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving..." : product ? "Save changes" : "Save product"}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
