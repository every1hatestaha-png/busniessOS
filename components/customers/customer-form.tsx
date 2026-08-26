"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the contact name"),
  companyName: z.string().trim().min(2, "Enter the company name"),
  phone: z.string().trim().min(10, "Enter a valid phone number"),
  email: z.string().trim().email("Enter a valid email address"),
  city: z.string().trim().min(2, "Enter the city"),
  address: z.string().trim().min(5, "Enter the full address"),
  creditLimit: z.string().trim().min(1, "Enter a credit limit").refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Credit limit cannot be negative"),
  openingBalance: z.string().trim().min(1, "Enter an opening balance").refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Opening balance cannot be negative"),
  status: z.enum(["ACTIVE", "INACTIVE", "BLACKLISTED"]),
  notes: z.string().trim().max(500, "Notes must be under 500 characters"),
});

type FormValues = z.infer<typeof schema>;
const labelClassName = "mb-1.5 block text-sm font-medium text-neutral-700";
const fieldClassName = "space-y-1";

export function CustomerForm() {
  const [submittedName, setSubmittedName] = useState<string>();
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", companyName: "", phone: "", email: "", city: "", address: "", creditLimit: "0", openingBalance: "0", status: "ACTIVE", notes: "" },
  });

  function onSubmit(values: FormValues) {
    setSubmittedName(values.companyName);
    reset();
  }

  const error = (name: keyof FormValues) => errors[name] && <p className="text-xs text-red-600">{errors[name]?.message}</p>;

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
        <div className="mb-5"><h2 className="font-semibold">Credit settings</h2><p className="text-sm text-neutral-500">Set the starting receivable and maximum approved credit.</p></div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className={fieldClassName}><label className={labelClassName} htmlFor="creditLimit">Credit limit (PKR)</label><Input id="creditLimit" type="number" min="0" step="1" {...register("creditLimit")} aria-invalid={!!errors.creditLimit} />{error("creditLimit")}</div>
          <div className={fieldClassName}><label className={labelClassName} htmlFor="openingBalance">Opening balance (PKR)</label><Input id="openingBalance" type="number" min="0" step="1" {...register("openingBalance")} aria-invalid={!!errors.openingBalance} />{error("openingBalance")}</div>
          <div className={`${fieldClassName} md:col-span-2`}><label className={labelClassName} htmlFor="notes">Notes <span className="font-normal text-neutral-400">(optional)</span></label><textarea id="notes" {...register("notes")} rows={4} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200" placeholder="Delivery preferences, payment terms, or account notes" />{error("notes")}</div>
        </div>
      </div>
      {submittedName && <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>{submittedName}</strong> passed validation. This is a demo, so the customer was not saved and the form has been reset.</p></div>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Link href="/customers" className={buttonVariants({ variant: "outline" })}>Cancel</Link><Button type="submit" disabled={isSubmitting}>Validate demo customer</Button></div>
    </form>
  );
}
