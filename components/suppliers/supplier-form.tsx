"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import {
  createSupplierAction,
  updateSupplierAction,
  type SupplierFormState,
} from "@/app/(dashboard)/suppliers/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { supplierSchema, type SupplierInput } from "@/lib/validation/supplier";

type FormInput = z.input<typeof supplierSchema>;
const initialState: SupplierFormState = {};
const labelClassName = "mb-1.5 block text-sm font-medium text-neutral-700";
const fieldClassName = "space-y-1";

type SupplierFormProps = {
  supplier?: SupplierInput & { id: string };
};

export function SupplierForm({ supplier }: SupplierFormProps) {
  const action = supplier ? updateSupplierAction.bind(null, supplier.id) : createSupplierAction;
  const [state, submitAction, isPending] = useActionState(action, initialState);
  const { register, handleSubmit, formState: { errors } } = useForm<FormInput, unknown, SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: supplier
      ? { name: supplier.name, companyName: supplier.companyName, phone: supplier.phone, email: supplier.email, address: supplier.address, city: supplier.city, notes: supplier.notes, openingBalance: 0 }
      : { name: "", companyName: "", phone: "", email: "", address: "", city: "", notes: "", openingBalance: 0 },
  });

  function onSubmit(values: SupplierInput) {
    startTransition(() => submitAction(values));
  }

  const error = (name: keyof FormInput) => {
    const message = errors[name]?.message ?? state.fieldErrors?.[name]?.[0];
    return message && <p className="text-xs text-red-600">{message}</p>;
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6">
        <div className="mb-5"><h2 className="font-semibold">Supplier details</h2><p className="text-sm text-neutral-500">Contact and business information. Editing here never changes the payable balance.</p></div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className={fieldClassName}><label className={labelClassName} htmlFor="name">Contact name</label><Input id="name" {...register("name")} aria-invalid={!!errors.name} placeholder="Bilal Traders" />{error("name")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="companyName">Company name</label><Input id="companyName" {...register("companyName")} aria-invalid={!!errors.companyName} placeholder="Bilal Trading Co." />{error("companyName")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="phone">Phone</label><Input id="phone" {...register("phone")} aria-invalid={!!errors.phone} placeholder="0300 1234567" />{error("phone")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="email">Email</label><Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} placeholder="accounts@supplier.pk" />{error("email")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="city">City</label><Input id="city" {...register("city")} aria-invalid={!!errors.city} placeholder="Karachi" />{error("city")}</div>
          {!supplier && <div className={fieldClassName}><label className={labelClassName} htmlFor="openingBalance">Opening payable balance</label><Input id="openingBalance" type="number" min="0" step="0.01" {...register("openingBalance")} aria-invalid={!!errors.openingBalance} />{error("openingBalance")}</div>}
          <div className={`${fieldClassName} md:col-span-2`}><label className={labelClassName} htmlFor="address">Address</label><Input id="address" {...register("address")} aria-invalid={!!errors.address} placeholder="Street, market, city" />{error("address")}</div>
          <div className={`${fieldClassName} md:col-span-2`}><label className={labelClassName} htmlFor="notes">Notes <span className="font-normal text-neutral-400">(optional)</span></label><textarea id="notes" {...register("notes")} rows={4} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200" placeholder="Payment terms, delivery lead time, or account notes" />{error("notes")}</div>
        </div>
      </div>
      {state.message && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.message}</div>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Link href={supplier ? `/suppliers/${supplier.id}` : "/suppliers"} className={buttonVariants({ variant: "outline" })}>Cancel</Link><Button type="submit" disabled={isPending}>{isPending ? "Saving..." : supplier ? "Save changes" : "Add supplier"}</Button></div>
    </form>
  );
}
