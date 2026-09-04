"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { createSaleAction, type CreateSaleState } from "@/app/(dashboard)/sales/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calculateBalance, calculateOrderTotal, formatPKR } from "@/lib/utils";
import { saleSchema, type SaleInput } from "@/lib/validation/sale";

const orderSchema = saleSchema.superRefine((order, context) => {
  const gross = order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const lineDiscounts = order.items.reduce((sum, item) => sum + item.discount, 0);
  if (order.orderDiscount > Math.max(0, gross - lineDiscounts)) context.addIssue({ code: "custom", message: "Discount exceeds the remaining order value", path: ["orderDiscount"] });
  const total = Math.max(0, gross - lineDiscounts - order.orderDiscount);
  if (order.paidAmount > total) context.addIssue({ code: "custom", message: "Paid amount cannot exceed the total", path: ["paidAmount"] });
});

type OrderFormInput = z.input<typeof orderSchema>;
type OrderFormValues = z.output<typeof orderSchema>;
type CustomerOption = { id: string; name: string; companyName: string; phone: string; creditLimit: number; currentBalance: number; status: "ACTIVE" | "INACTIVE" | "BLACKLISTED" };
type ProductOption = { id: string; name: string; sku: string; sellingPrice: number; stockQuantity: number; status: "ACTIVE" | "INACTIVE" | "ARCHIVED"; unit: string };
type CashBankOption = { cashBankAccountId: string; name: string; currentBalance: number; isBank: boolean; bankName?: string | null };

const fieldClass = "h-8 w-full rounded-md border border-input bg-white px-2.5 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

export function SalesOrderForm({ customers, products, cashBankAccounts = [], canRecordPayments = true }: { customers: CustomerOption[]; products: ProductOption[]; cashBankAccounts?: CashBankOption[]; canRecordPayments?: boolean }) {
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

  return <form onSubmit={handleSubmit(submitOrder)} className="mx-auto max-w-[1600px] space-y-6">
    <header className="flex items-end justify-between gap-4">
      <div><Link href="/sales" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="size-3.5" />Sales</Link><h1 className="text-xl font-semibold tracking-tight text-slate-950">New Sales Order</h1><p className="mt-0.5 text-xs text-slate-500">Creates a confirmed order, invoice, and stock movement.</p></div>
      <div className="flex gap-2"><Button type="button" variant="outline" size="sm" render={<Link href="/sales" />}>Cancel</Button><Button type="submit" size="sm" disabled={isSubmitting || isPending}>{isPending ? "Creating..." : "Create Sale"}</Button></div>
    </header>

    {actionState.error && <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-red-800"><AlertCircle className="mt-0.5 size-4 shrink-0" /><p className="text-xs font-medium">{actionState.error}</p></div>}

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
          <CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Customer & Order</CardTitle></CardHeader>
          <CardContent className="p-4">
            <Field label="Customer" error={errors.customerId?.message}><select {...register("customerId")} className={fieldClass} aria-invalid={Boolean(errors.customerId)}><option value="">Choose a customer</option>{customers.filter((customer) => customer.status === "ACTIVE").map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName} · {customer.name}</option>)}</select></Field>
            {selectedCustomer && <div className="mt-3 grid divide-x rounded-md border bg-slate-50 sm:grid-cols-3"><AccountFact label="Contact" value={selectedCustomer.phone || "No phone provided"} /><AccountFact label="Current balance" value={formatPKR(selectedCustomer.currentBalance)} /><AccountFact label="Available credit" value={selectedCustomer.creditLimit > 0 ? formatPKR(Math.max(0, selectedCustomer.creditLimit - selectedCustomer.currentBalance)) : "Not configured"} /></div>}
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
          <CardHeader className="flex-row items-center justify-between border-b px-4 py-3"><div><CardTitle className="text-sm font-semibold">Line Items</CardTitle><p className="mt-0.5 text-[11px] text-slate-500">Fixed discounts are applied per line.</p></div><Button type="button" variant="outline" size="xs" onClick={() => append({ productId: "", quantity: 1, unitPrice: 0, discount: 0 })}><Plus />Add line</Button></CardHeader>
           <CardContent className="overflow-x-auto p-0">
             <div className="min-w-[760px]"><div className="grid grid-cols-[minmax(220px,1fr)_90px_120px_110px_130px_36px] gap-2 border-b bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><span>Product</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Discount</span><span className="text-right">Line total</span><span /></div>
            {fields.map((field, index) => {
              const line = items[index];
              const lineTotal = Math.max(0, (line?.quantity || 0) * (line?.unitPrice || 0) - (line?.discount || 0));
              const selectedProduct = products.find((product) => product.id === line?.productId);
              return <div key={field.id} className="grid grid-cols-[minmax(220px,1fr)_90px_120px_110px_130px_36px] items-start gap-2 border-b px-4 py-2.5 last:border-0">
                <Field error={errors.items?.[index]?.productId?.message}><select value={line?.productId ?? ""} onChange={(event) => selectProduct(index, event.target.value)} className={fieldClass}><option value="">Select product</option>{products.filter((product) => product.status === "ACTIVE").map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}</select>{selectedProduct && <span className="mt-1 block text-[10px] text-slate-500">Available {selectedProduct.stockQuantity} {selectedProduct.unit.toLowerCase()}</span>}</Field>
                <Field error={errors.items?.[index]?.quantity?.message}><Input type="number" min="1" step="1" className="text-right text-xs" {...register(`items.${index}.quantity`, { valueAsNumber: true })} /></Field>
                <Field error={errors.items?.[index]?.unitPrice?.message}><Input type="number" min="0" step="1" className="text-right text-xs" {...register(`items.${index}.unitPrice`, { valueAsNumber: true })} /></Field>
                <Field error={errors.items?.[index]?.discount?.message}><Input type="number" min="0" step="1" className="text-right text-xs" {...register(`items.${index}.discount`, { valueAsNumber: true })} /></Field>
                <div className="flex h-8 items-center justify-end text-xs font-semibold tabular-nums">{formatPKR(lineTotal)}</div>
                <Button type="button" variant="ghost" size="icon" disabled={fields.length === 1} onClick={() => remove(index)} aria-label={`Remove line ${index + 1}`}><Trash2 className="text-red-600" /></Button>
              </div>;
            })}
             {errors.items?.root?.message && <p className="border-t px-4 py-2 text-xs font-medium text-red-600">{errors.items.root.message}</p>}</div>
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Payment & Notes</CardTitle></CardHeader><CardContent className="grid gap-4 p-4 md:grid-cols-2"><Field label="Order discount" hint="After line discounts" error={errors.orderDiscount?.message}><Input type="number" min="0" step="1" {...register("orderDiscount", { valueAsNumber: true })} /></Field>{canRecordPayments && <Field label="Paid now" hint="Optional initial receipt" error={errors.paidAmount?.message}><Input type="number" min="0" step="1" {...register("paidAmount", { valueAsNumber: true })} /></Field>}{canRecordPayments && paidAmount > 0 && <Field label="Receive into" hint="Required" error={errors.cashBankAccountId?.message}><select {...register("cashBankAccountId")} className={fieldClass} required><option value="">Select cash/bank account</option>{cashBankAccounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}{account.isBank && account.bankName ? ` · ${account.bankName}` : ""} · {formatPKR(account.currentBalance)}</option>)}</select>{cashBankAccounts.length === 0 && <span className="mt-1 block text-[10px] font-medium text-red-600">Create an active cash/bank account before receiving payment.</span>}</Field>}<div className={canRecordPayments && paidAmount > 0 ? "" : "md:col-span-2"}><Field label="Notes" error={errors.notes?.message}><textarea {...register("notes")} rows={3} placeholder="Dispatch, delivery, or payment instructions" className={`${fieldClass} h-auto resize-y py-2`} /></Field></div></CardContent></Card>
      </div>

      <Card className="sticky top-6 gap-0 rounded-md border py-0 shadow-none ring-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-sm font-semibold">Order Summary</CardTitle></CardHeader><CardContent className="space-y-3 p-4 text-xs"><SummaryRow label="Subtotal" value={formatPKR(subtotal)} /><SummaryRow label="Line discounts" value={`- ${formatPKR(lineDiscounts)}`} /><SummaryRow label="Order discount" value={`- ${formatPKR(orderDiscount)}`} /><div className="flex items-center justify-between border-t pt-3"><span className="font-semibold">Total</span><span className="text-lg font-semibold tabular-nums">{formatPKR(total)}</span></div><SummaryRow label="Paid now" value={formatPKR(paidAmount)} /><div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-950"><span className="font-medium">New receivable</span><span className="text-base font-semibold tabular-nums">{formatPKR(balance)}</span></div>{selectedCustomer && <SummaryRow label="Available credit" value={selectedCustomer.creditLimit > 0 ? formatPKR(Math.max(0, selectedCustomer.creditLimit - selectedCustomer.currentBalance)) : "Not configured"} />}<p className="border-t pt-3 text-[10px] leading-relaxed text-slate-500">Creating this confirmed order updates stock and customer balance, and creates an invoice. A paid amount also records a receipt.</p><Button type="submit" className="w-full" disabled={isSubmitting || isPending}>{isPending ? "Creating..." : "Create Confirmed Sale"}</Button></CardContent></Card>
    </div>
  </form>;
}

function Field({ label, hint, error, children }: { label?: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <label className="block">{label && <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-slate-700"><span>{label}</span>{hint && <span className="text-[10px] font-normal text-slate-400">{hint}</span>}</span>}{children}{error && <span className="mt-1 block text-[10px] font-medium text-red-600">{error}</span>}</label>;
}

function AccountFact({ label, value }: { label: string; value: string }) { return <div className="px-3 py-2.5"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-0.5 truncate text-xs font-medium">{value}</p></div>; }
function SummaryRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium tabular-nums">{value}</span></div>; }
