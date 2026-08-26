"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createProductAction } from "@/app/(dashboard)/inventory/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { productSchema, type ProductInput } from "@/lib/validation/product";

type ProductFormInput = ProductInput;
type ProductFormValues = z.output<typeof productSchema>;

const fieldClass = "space-y-1.5";
const labelClass = "text-sm font-medium text-neutral-800";
const errorClass = "text-xs text-red-600";

export function ProductForm() {
  const [actionState, formAction, isPending] = useActionState(createProductAction, {});
  const { register, handleSubmit, formState: { errors } } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { unit: "PIECE", stockQuantity: 0, reorderLevel: 10 },
  });

  function submit(values: ProductFormValues) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => formData.set(key, String(value)));
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Product information</CardTitle>
          <p className="text-sm text-neutral-500">Pricing is recorded in PKR. Stock quantities must be whole numbers.</p>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
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
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="stockQuantity">Opening stock</label>
            <Input id="stockQuantity" type="number" min="0" step="1" aria-invalid={!!errors.stockQuantity} {...register("stockQuantity")} />
            {errors.stockQuantity && <p className={errorClass}>{errors.stockQuantity.message}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="reorderLevel">Reorder level</label>
            <Input id="reorderLevel" type="number" min="0" step="1" aria-invalid={!!errors.reorderLevel} {...register("reorderLevel")} />
            {errors.reorderLevel && <p className={errorClass}>{errors.reorderLevel.message}</p>}
          </div>
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
        <CardFooter className="justify-end gap-2">
          <Link href="/inventory" className={buttonVariants({ variant: "outline" })}>Cancel</Link>
          <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save product"}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
