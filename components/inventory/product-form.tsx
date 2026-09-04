"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { startTransition, useEffect, useRef, useActionState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createProductAction, updateProductAction } from "@/app/(dashboard)/inventory/actions";
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
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitSuccessful } } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product ? { ...product, stockQuantity: 0 } : { unit: "PIECE", stockQuantity: 0, reorderLevel: 10 },
  });
  const selectedUnit = watch("unit");
  const isKgMode = selectedUnit === "KG";
  const qtyStep = isKgMode ? "0.01" : "1";
  const allValues = watch();
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
    Object.entries(values).forEach(([key, value]) => formData.set(key, String(value)));
    startTransition(() => formAction(formData));
  }

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
          <div className="border-t pt-4 md:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pricing and stock controls</p></div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="costPrice">Cost price</label>
            <Input id="costPrice" type="number" min="0" step="1" placeholder="0" aria-invalid={!!errors.costPrice} {...register("costPrice")} />
            {errors.costPrice && <p className={errorClass}>{errors.costPrice.message}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="sellingPrice">Selling price</label>
            <Input id="sellingPrice" type="number" min="1" step="1" placeholder="0" aria-invalid={!!errors.sellingPrice} {...register("sellingPrice")} />
            {errors.sellingPrice && <p className={errorClass}>{errors.sellingPrice.message}</p>}
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
