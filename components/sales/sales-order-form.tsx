"use client";

import { startTransition, useActionState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { createSaleAction, type CreateSaleState } from "@/app/(dashboard)/sales/actions";
import { calculateBalance, calculateOrderTotal, formatPKR } from "@/lib/utils";
import { saleSchema, type SaleInput } from "@/lib/validation/sale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const orderSchema = saleSchema.superRefine((order, context) => {
  const gross = order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const lineDiscounts = order.items.reduce((sum, item) => sum + item.discount, 0);
  if (order.orderDiscount > Math.max(0, gross - lineDiscounts)) context.addIssue({ code: "custom", message: "Discount exceeds the remaining order value", path: ["orderDiscount"] });
  const total = Math.max(0, gross - lineDiscounts - order.orderDiscount);
  if (order.paidAmount > total) context.addIssue({ code: "custom", message: "Paid amount cannot exceed the total", path: ["paidAmount"] });
});

type OrderFormInput = z.input<typeof orderSchema>;
type OrderFormValues = z.output<typeof orderSchema>;

type CustomerOption = {
  id: string;
  name: string;
  companyName: string;
  phone: string;
  creditLimit: number;
  currentBalance: number;
  status: "ACTIVE" | "INACTIVE" | "BLACKLISTED";
};

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  stockQuantity: number;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  unit: string;
};

const fieldClass = "h-9 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/50";

type CashBankOption = { cashBankAccountId: string; name: string; currentBalance: number; isBank: boolean; bankName?: string | null };

export function SalesOrderForm({ customers, products, cashBankAccounts = [] }: { customers: CustomerOption[]; products: ProductOption[]; cashBankAccounts?: CashBankOption[] }) {
  const [actionState, submitAction, isPending] = useActionState(createSaleAction, {} as CreateSaleState);
  const { control, register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<OrderFormInput, unknown, OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: { customerId: "", items: [{ productId: "", quantity: 1, unitPrice: 0, discount: 0 }], orderDiscount: 0, paidAmount: 0, cashBankAccountId: "", notes: "", idempotencyKey: "00000000-0000-0000-0000-000000000000" },
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

  function submitOrder(values: OrderFormValues) {
    const idempotencyKey = values.idempotencyKey === "00000000-0000-0000-0000-000000000000" ? crypto.randomUUID() : values.idempotencyKey;
    setValue("idempotencyKey", idempotencyKey);
    const input: SaleInput = { ...values, idempotencyKey };
    startTransition(() => submitAction(input));
  }

  return (
    <form onSubmit={handleSubmit(submitOrder)} className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><Link href="/sales" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-950"><ArrowLeft className="h-4 w-4" /> Sales orders</Link><h1 className="text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl">Create sales order</h1><p className="mt-1 text-sm text-neutral-500">Review the confirmed order before creating it.</p></div>
        <div className="flex gap-2"><Button type="button" variant="outline" render={<Link href="/sales" />}>Cancel</Button><Button type="submit" disabled={isSubmitting || isPending}>{isPending ? "Creating..." : "Create order"}</Button></div>
      </div>

      {actionState.error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm font-medium">{actionState.error}</p></div>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader><CardTitle>Customer and order</CardTitle></CardHeader>
            <CardContent className="grid gap-5">
              <Field label="Customer" error={errors.customerId?.message}>
                <select {...register("customerId")} className={fieldClass} aria-invalid={Boolean(errors.customerId)}><option value="">Choose a customer</option>{customers.filter((customer) => customer.status === "ACTIVE").map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName} · {customer.name}</option>)}</select>
              </Field>
              {selectedCustomer && <div className="rounded-lg bg-neutral-50 p-4"><div className="grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-neutral-500">Contact</p><p className="mt-1 font-medium">{selectedCustomer.phone || "No phone provided"}</p></div><div><p className="text-xs text-neutral-500">Current balance</p><p className="mt-1 font-medium">{formatPKR(selectedCustomer.currentBalance)}</p></div><div><p className="text-xs text-neutral-500">Available credit</p><p className="mt-1 font-medium">{formatPKR(Math.max(0, selectedCustomer.creditLimit - selectedCustomer.currentBalance))}</p></div></div></div>}
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

          <Card className="shadow-none"><CardHeader><CardTitle>Payment and notes</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><Field label="Order discount" hint="Applied after line discounts" error={errors.orderDiscount?.message}><Input type="number" min="0" step="1" className="h-9" {...register("orderDiscount", { valueAsNumber: true })} /></Field><Field label="Paid amount" hint="Amount received with this order" error={errors.paidAmount?.message}><Input type="number" min="0" step="1" className="h-9" {...register("paidAmount", { valueAsNumber: true })} /></Field>{paidAmount > 0 && <Field label="Receive into" hint="Cash/bank account for this receipt"><select {...register("cashBankAccountId")} className={fieldClass} required><option value="">Select cash/bank</option>{cashBankAccounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}{account.isBank && account.bankName ? ` · ${account.bankName}` : ""} · {formatPKR(account.currentBalance)}</option>)}</select></Field>}<div className="md:col-span-2"><Field label="Notes" error={errors.notes?.message}><textarea {...register("notes")} rows={4} placeholder="Dispatch, delivery, or payment instructions" className={`${fieldClass} h-auto resize-y py-2`} /></Field></div></CardContent></Card>
        </div>

        <Card className="shadow-none xl:sticky xl:top-6">
          <CardHeader><CardTitle>Order summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm"><SummaryRow label="Subtotal" value={formatPKR(subtotal)} /><SummaryRow label="Line discounts" value={`- ${formatPKR(lineDiscounts)}`} /><SummaryRow label="Order discount" value={`- ${formatPKR(orderDiscount)}`} /><div className="flex items-center justify-between border-t pt-4 text-base"><span className="font-semibold">Total</span><span className="text-xl font-bold">{formatPKR(total)}</span></div><SummaryRow label="Paid" value={formatPKR(paidAmount)} /><div className="flex items-center justify-between rounded-lg bg-neutral-950 p-4 text-white"><span className="font-medium">Balance due</span><span className="text-lg font-bold">{formatPKR(balance)}</span></div></div>
            <p className="border-t pt-4 text-xs leading-5 text-neutral-500">Creating this confirmed order updates stock, customer balance, and creates an invoice.</p>
            <Button type="submit" className="w-full" disabled={isSubmitting || isPending}>{isPending ? "Creating..." : "Create confirmed order"}</Button>
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
