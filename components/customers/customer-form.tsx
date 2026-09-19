"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { startTransition, useActionState } from "react";
import { type Resolver, useForm } from "react-hook-form";

import {
  createCustomerAction,
  type CreateCustomerState,
  updateCustomerAction,
} from "@/app/(dashboard)/customers/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { serializeContactPhones, splitContactPhones } from "@/lib/contact-phones";
import {
  customerSchema,
  type CustomerEditInput,
  type CustomerInput,
} from "@/lib/validation/customer";

type FormValues = CustomerInput & { creditDays: number };

const defaultFormValues = { name: "", companyName: "", phone: "", email: "", city: "", address: "", taxId: "", province: "", registrationType: "" as const, creditDays: 30, creditLimit: "0", openingBalance: "0", status: "ACTIVE" as const, notes: "" };
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
    resolver: zodResolver(customerSchema) as unknown as Resolver<FormValues>,
    defaultValues: customer
      ? { ...customer, openingBalance: "0", creditDays: customer.creditDays ?? 30 }
      : defaultFormValues,
  });

  function onSubmit(values: FormValues) {
    const normalized = {
      ...values,
      phone: serializeContactPhones(splitContactPhones(values.phone)),
    };
    startTransition(() => submitAction(normalized));
  }

  const error = (name: keyof FormValues) => {
    const message = errors[name]?.message ?? state.fieldErrors?.[name]?.[0];
    return message && <p className="text-xs text-red-600">{message}</p>;
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
        <div className="mb-4"><h2 className="font-semibold">Account identity</h2><p className="text-xs text-neutral-500">Contact and business information for this account.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className={fieldClassName}><label className={labelClassName} htmlFor="name">Contact name</label><Input id="name" {...register("name")} aria-invalid={!!errors.name} placeholder="Ahmed Ali" />{error("name")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="companyName">Company name</label><Input id="companyName" {...register("companyName")} aria-invalid={!!errors.companyName} placeholder="Ahmed Autos" />{error("companyName")}</div>
          <div className={`${fieldClassName} md:col-span-2`}>
            <label className={labelClassName} htmlFor="phone">Phone / WhatsApp numbers</label>
            <textarea id="phone" {...register("phone")} rows={3} aria-invalid={!!errors.phone} placeholder={"0300 1234567\n0321 7654321"} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-neutral-200" />
            <p className="text-xs text-neutral-500">Add up to 6 numbers, one per line. The first number is treated as the primary contact; Smart Collections lets you choose any valid WhatsApp number before sending a reminder.</p>
            {error("phone")}
          </div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="email">Email</label><Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} placeholder="accounts@company.pk" />{error("email")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="city">City</label><Input id="city" {...register("city")} aria-invalid={!!errors.city} placeholder="Lahore" />{error("city")}</div>
          <div className="md:col-span-2 border-t pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">FBR Digital Invoicing identity</p><p className="mt-1 text-xs text-neutral-500">Optional for normal CRM use. Required when this customer is used on an FBR-submitted invoice.</p></div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="registrationType">FBR registration type</label><select id="registrationType" {...register("registrationType")} className="h-8 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm"><option value="">Not configured</option><option value="Registered">Registered</option><option value="Unregistered">Unregistered</option></select>{error("registrationType")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="taxId">NTN / CNIC</label><Input id="taxId" {...register("taxId")} placeholder="7-digit NTN or 13-digit CNIC" />{error("taxId")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="province">Province</label><select id="province" {...register("province")} className="h-8 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm"><option value="">Select province</option><option value="PUNJAB">Punjab</option><option value="SINDH">Sindh</option><option value="KHYBER PAKHTUNKHWA">Khyber Pakhtunkhwa</option><option value="BALOCHISTAN">Balochistan</option><option value="ISLAMABAD CAPITAL TERRITORY">Islamabad Capital Territory</option><option value="GILGIT BALTISTAN">Gilgit Baltistan</option><option value="AZAD JAMMU AND KASHMIR">Azad Jammu and Kashmir</option></select>{error("province")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="status">Status</label><select id="status" {...register("status")} className="h-8 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-neutral-200"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="BLACKLISTED">Blacklisted</option></select>{error("status")}</div>
          <div className={`${fieldClassName} md:col-span-2`}><label className={labelClassName} htmlFor="address">Address</label><Input id="address" {...register("address")} aria-invalid={!!errors.address} placeholder="Street, market, city" />{error("address")}</div>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
        <div className="mb-4"><h2 className="font-semibold">Credit controls</h2><p className="text-xs text-neutral-500">{customer ? "Set the maximum approved credit. Current receivable cannot be changed here." : "Set the starting receivable and maximum approved credit."}</p></div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className={fieldClassName}><label className={labelClassName} htmlFor="creditDays">Credit days</label><Input id="creditDays" type="number" min="0" max="365" step="1" {...register("creditDays", { valueAsNumber: true })} aria-invalid={!!errors.creditDays} /><p className="text-xs text-neutral-500">Customer payment period used for new invoice due dates.</p>{error("creditDays")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="creditLimit">Credit limit (PKR)</label><Input id="creditLimit" type="number" min="0" step="1" {...register("creditLimit")} aria-invalid={!!errors.creditLimit} /><p className="text-xs text-neutral-500">Enter 0 when no credit limit is configured.</p>{error("creditLimit")}</div>
           {!customer && <div className={fieldClassName}><label className={labelClassName} htmlFor="openingBalance">Opening receivable (PKR)</label><Input id="openingBalance" type="number" min="0" step="1" {...register("openingBalance")} aria-invalid={!!errors.openingBalance} /><p className="text-xs text-amber-700">A positive amount establishes the opening receivable and posts its accounting entry.</p>{error("openingBalance")}</div>}
          <div className={`${fieldClassName} md:col-span-2`}><label className={labelClassName} htmlFor="notes">Notes <span className="font-normal text-neutral-400">(optional)</span></label><textarea id="notes" {...register("notes")} rows={4} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200" placeholder="Delivery preferences, payment terms, or account notes" />{error("notes")}</div>
        </div>
      </div>
      {state.message && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.message}</div>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Link href={customer ? `/customers/${customer.id}` : "/customers"} className={buttonVariants({ variant: "outline", size: "sm" })}>Cancel</Link><Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving..." : customer ? "Save changes" : "Add customer"}</Button></div>
    </form>
  );
}
