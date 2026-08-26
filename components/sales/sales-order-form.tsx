"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import type { Customer, Product } from "@/lib/demo-data";
import { calculateBalance, calculateOrderTotal, formatPKR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const itemSchema = z.object({
  productId: z.string().min(1, "Select a product"),
  quantity: z.number().int("Use a whole quantity").min(1, "Minimum quantity is 1"),
  unitPrice: z.number().min(0, "Price cannot be negative"),
  discount: z.number().min(0, "Discount cannot be negative"),
});

const orderSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  status: z.enum(["DRAFT", "CONFIRMED"]),
  items: z.array(itemSchema).min(1, "Add at least one product"),
  orderDiscount: z.number().min(0, "Discount cannot be negative"),
  paidAmount: z.number().min(0, "Paid amount cannot be negative"),
  notes: z.string().max(500, "Notes must be 500 characters or fewer"),
}).superRefine((order, context) => {
  const gross = order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const lineDiscounts = order.items.reduce((sum, item) => sum + item.discount, 0);
  order.items.forEach((item, index) => {
    if (item.discount > item.quantity * item.unitPrice) context.addIssue({ code: "custom", message: "Discount exceeds line value", path: ["items", index, "discount"] });
  });
  if (order.orderDiscount > Math.max(0, gross - lineDiscounts)) context.addIssue({ code: "custom", message: "Discount exceeds the remaining order value", path: ["orderDiscount"] });
  const total = Math.max(0, gross - lineDiscounts - order.orderDiscount);
  if (order.paidAmount > total) context.addIssue({ code: "custom", message: "Paid amount cannot exceed the total", path: ["paidAmount"] });
});

type OrderFormValues = z.infer<typeof orderSchema>;

const fieldClass = "h-9 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/50";

export function SalesOrderForm({ customers, products }: { customers: Customer[]; products: Product[] }) {
  const [submitted, setSubmitted] = useState(false);
  const { control, register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: { customerId: "", status: "CONFIRMED", items: [{ productId: "", quantity: 1, unitPrice: 0, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "" },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" }) ?? [];
  const orderDiscount = useWatch({ control, name: "orderDiscount" }) || 0;
  const paidAmount = useWatch({ control, name: "paidAmount" }) || 0;
  const customerId = useWatch({ control, name: "customerId" });
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const subtotal = items.reduce((sum, item) => sum + (item?.quantity || 0) * (item?.unitPrice || 0), 0);
  const lineDiscounts = items.reduce((sum, item) => sum + (item?.discount || 0), 0);
  const total = calculateOrderTotal(Math.max(0, subtotal - lineDiscounts), orderDiscount);
  const balance = calculateBalance(total, paidAmount);

  function selectProduct(index: number, productId: string) {
    setValue(`items.${index}.productId`, productId, { shouldValidate: true, shouldDirty: true });
    const product = products.find((entry) => entry.id === productId);
    if (product) setValue(`items.${index}.unitPrice`, product.sellingPrice, { shouldValidate: true, shouldDirty: true });
  }

  function submitDemoOrder() {
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <form onSubmit={handleSubmit(submitDemoOrder)} className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><Link href="/sales" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-950"><ArrowLeft className="h-4 w-4" /> Sales orders</Link><h1 className="text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl">Create sales order</h1><p className="mt-1 text-sm text-neutral-500">Prepare a demo order and review totals before submitting.</p></div>
        <div className="flex gap-2"><Button type="button" variant="outline" render={<Link href="/sales" />}>Cancel</Button><Button type="submit" disabled={isSubmitting}>Create demo order</Button></div>
      </div>

      {submitted && <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Demo order validated successfully</p><p className="mt-0.5 text-sm text-emerald-700">This preview is local only. No order was saved and the demo data has not changed.</p></div></div>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader><CardTitle>Customer and order</CardTitle></CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <Field label="Customer" error={errors.customerId?.message}>
                <select {...register("customerId")} className={fieldClass} aria-invalid={Boolean(errors.customerId)}><option value="">Choose a customer</option>{customers.filter((customer) => customer.status === "ACTIVE").map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName} · {customer.name}</option>)}</select>
              </Field>
              <Field label="Order status" error={errors.status?.message}>
                <select {...register("status")} className={fieldClass}><option value="CONFIRMED">Confirmed</option><option value="DRAFT">Draft</option></select>
              </Field>
              {selectedCustomer && <div className="rounded-lg bg-neutral-50 p-4 md:col-span-2"><div className="grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-neutral-500">Contact</p><p className="mt-1 font-medium">{selectedCustomer.phone}</p></div><div><p className="text-xs text-neutral-500">Current balance</p><p className="mt-1 font-medium">{formatPKR(selectedCustomer.currentBalance)}</p></div><div><p className="text-xs text-neutral-500">Available credit</p><p className="mt-1 font-medium">{formatPKR(Math.max(0, selectedCustomer.creditLimit - selectedCustomer.currentBalance))}</p></div></div></div>}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Products</CardTitle><p className="mt-1 text-sm text-neutral-500">Discounts are fixed amounts per line.</p></div><Button type="button" variant="outline" size="sm" onClick={() => append({ productId: "", quantity: 1, unitPrice: 0, discount: 0 })}><Plus /> Add product</Button></CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => {
                const line = items[index];
                const lineTotal = Math.max(0, (line?.quantity || 0) * (line?.unitPrice || 0) - (line?.discount || 0));
                const selectedProduct = products.find((product) => product.id === line?.productId);
                return <div key={field.id} className="rounded-xl border bg-neutral-50/50 p-4"><div className="mb-4 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Line {index + 1}</p><Button type="button" variant="ghost" size="icon-sm" disabled={fields.length === 1} onClick={() => remove(index)} aria-label={`Remove line ${index + 1}`}><Trash2 className="text-red-600" /></Button></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12"><div className="sm:col-span-2 lg:col-span-5"><Field label="Product" error={errors.items?.[index]?.productId?.message}><select value={line?.productId ?? ""} onChange={(event) => selectProduct(index, event.target.value)} className={fieldClass}><option value="">Select product</option>{products.filter((product) => product.status === "ACTIVE").map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}</select></Field></div><div className="lg:col-span-2"><Field label="Quantity" error={errors.items?.[index]?.quantity?.message}><Input type="number" min="1" step="1" className="h-9 bg-white" {...register(`items.${index}.quantity`, { valueAsNumber: true })} /></Field></div><div className="lg:col-span-2"><Field label="Unit price" error={errors.items?.[index]?.unitPrice?.message}><Input type="number" min="0" step="1" className="h-9 bg-white" {...register(`items.${index}.unitPrice`, { valueAsNumber: true })} /></Field></div><div className="lg:col-span-2"><Field label="Line discount" error={errors.items?.[index]?.discount?.message}><Input type="number" min="0" step="1" className="h-9 bg-white" {...register(`items.${index}.discount`, { valueAsNumber: true })} /></Field></div><div className="flex items-end lg:col-span-1"><div className="pb-2"><p className="text-xs text-neutral-500">Line total</p><p className="whitespace-nowrap font-semibold">{formatPKR(lineTotal)}</p></div></div></div>{selectedProduct && <p className="mt-3 text-xs text-neutral-500">{selectedProduct.stockQuantity} {selectedProduct.unit.toLowerCase()} in stock · Standard price {formatPKR(selectedProduct.sellingPrice)}</p>}</div>;
              })}
              {errors.items?.root?.message && <p className="text-xs font-medium text-red-600">{errors.items.root.message}</p>}
            </CardContent>
          </Card>

          <Card className="shadow-none"><CardHeader><CardTitle>Payment and notes</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><Field label="Order discount" hint="Applied after line discounts" error={errors.orderDiscount?.message}><Input type="number" min="0" step="1" className="h-9" {...register("orderDiscount", { valueAsNumber: true })} /></Field><Field label="Paid amount" hint="Amount received with this order" error={errors.paidAmount?.message}><Input type="number" min="0" step="1" className="h-9" {...register("paidAmount", { valueAsNumber: true })} /></Field><div className="md:col-span-2"><Field label="Notes" error={errors.notes?.message}><textarea {...register("notes")} rows={4} placeholder="Dispatch, delivery, or payment instructions" className={`${fieldClass} h-auto resize-y py-2`} /></Field></div></CardContent></Card>
        </div>

        <Card className="shadow-none xl:sticky xl:top-6">
          <CardHeader><CardTitle>Order summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm"><SummaryRow label="Subtotal" value={formatPKR(subtotal)} /><SummaryRow label="Line discounts" value={`- ${formatPKR(lineDiscounts)}`} /><SummaryRow label="Order discount" value={`- ${formatPKR(orderDiscount)}`} /><div className="flex items-center justify-between border-t pt-4 text-base"><span className="font-semibold">Total</span><span className="text-xl font-bold">{formatPKR(total)}</span></div><SummaryRow label="Paid" value={formatPKR(paidAmount)} /><div className="flex items-center justify-between rounded-lg bg-neutral-950 p-4 text-white"><span className="font-medium">Balance due</span><span className="text-lg font-bold">{formatPKR(balance)}</span></div></div>
            <p className="border-t pt-4 text-xs leading-5 text-neutral-500">Demo mode: submitting validates this order in your browser only. It does not persist, reserve stock, or create an invoice.</p>
            <Button type="submit" className="w-full" disabled={isSubmitting}>Create demo order</Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 flex items-center justify-between gap-2 text-sm font-medium text-neutral-800"><span>{label}</span>{hint && <span className="text-xs font-normal text-neutral-400">{hint}</span>}</span>{children}{error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}</label>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-neutral-500">{label}</span><span className="font-medium">{value}</span></div>;
}
