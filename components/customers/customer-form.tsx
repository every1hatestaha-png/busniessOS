"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import {
  createCustomerAction,
  type CreateCustomerState,
  updateCustomerAction,
} from "@/app/(dashboard)/customers/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  customerSchema,
  type CustomerEditInput,
  type CustomerInput,
} from "@/lib/validation/customer";

type FormValues = CustomerInput;
const initialState: CreateCustomerState = {};
const labelClassName = "mb-1.5 block text-sm font-medium text-neutral-700";
const fieldClassName = "space-y-1";

type CustomerFormProps = {
  customer?: CustomerEditInput & { id: string };
};

export function CustomerForm({ customer }: CustomerFormProps) {
  const action = customer ? updateCustomerAction.bind(null, customer.id) : createCustomerAction;
  const [state, submitAction, isPending] = useActionState(action, initialState);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: customer
      ? { ...customer, openingBalance: "0" }
      : { name: "", companyName: "", phone: "", email: "", city: "", address: "", creditLimit: "0", openingBalance: "0", status: "ACTIVE", notes: "" },
  });

  function onSubmit(values: FormValues) {
    startTransition(() => submitAction(values));
  }

  const error = (name: keyof FormValues) => {
    const message = errors[name]?.message ?? state.fieldErrors?.[name]?.[0];
    return message && <p className="text-xs text-red-600">{message}</p>;
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6">
        <div className="mb-5"><h2 className="font-semibold">Customer details</h2><p className="text-sm text-neutral-500">Contact and business information for this account.</p></div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className={fieldClassName}><label className={labelClassName} htmlFor="name">Contact name</label><Input id="name" {...register("name")} aria-invalid={!!errors.name} placeholder="Ahmed Ali" />{error("name")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="companyName">Company name</label><Input id="companyName" {...register("companyName")} aria-invalid={!!errors.companyName} placeholder="Ahmed Autos" />{error("companyName")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="phone">Phone</label><Input id="phone" {...register("phone")} aria-invalid={!!errors.phone} placeholder="0300 1234567" />{error("phone")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="email">Email</label><Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} placeholder="accounts@company.pk" />{error("email")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="city">City</label><Input id="city" {...register("city")} aria-invalid={!!errors.city} placeholder="Lahore" />{error("city")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="status">Status</label><select id="status" {...register("status")} className="h-8 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-neutral-200"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="BLACKLISTED">Blacklisted</option></select>{error("status")}</div>
          <div className={`${fieldClassName} md:col-span-2`}><label className={labelClassName} htmlFor="address">Address</label><Input id="address" {...register("address")} aria-invalid={!!errors.address} placeholder="Street, market, city" />{error("address")}</div>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6">
        <div className="mb-5"><h2 className="font-semibold">Credit settings</h2><p className="text-sm text-neutral-500">{customer ? "Set the maximum approved credit without changing the current balance." : "Set the starting receivable and maximum approved credit."}</p></div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className={fieldClassName}><label className={labelClassName} htmlFor="creditLimit">Credit limit (PKR)</label><Input id="creditLimit" type="number" min="0" step="1" {...register("creditLimit")} aria-invalid={!!errors.creditLimit} />{error("creditLimit")}</div>
          {!customer && <div className={fieldClassName}><label className={labelClassName} htmlFor="openingBalance">Opening balance (PKR)</label><Input id="openingBalance" type="number" min="0" step="1" {...register("openingBalance")} aria-invalid={!!errors.openingBalance} />{error("openingBalance")}</div>}
          <div className={`${fieldClassName} md:col-span-2`}><label className={labelClassName} htmlFor="notes">Notes <span className="font-normal text-neutral-400">(optional)</span></label><textarea id="notes" {...register("notes")} rows={4} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200" placeholder="Delivery preferences, payment terms, or account notes" />{error("notes")}</div>
        </div>
      </div>
      {state.message && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.message}</div>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Link href={customer ? `/customers/${customer.id}` : "/customers"} className={buttonVariants({ variant: "outline" })}>Cancel</Link><Button type="submit" disabled={isPending}>{isPending ? "Saving..." : customer ? "Save changes" : "Add customer"}</Button></div>
    </form>
  );
}
