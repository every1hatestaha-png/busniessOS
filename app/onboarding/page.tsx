"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, Building2, CheckCircle2, Sparkles } from "lucide-react";
import { DEMO_BUSINESS } from "@/lib/demo-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const onboardingSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required"),
  ownerName: z.string().trim().min(2, "Owner name is required"),
  phone: z.string().trim().regex(/^03\d{2}[\s-]?\d{7}$/, "Enter a valid Pakistani mobile number"),
  city: z.string().trim().min(2, "City is required"),
  address: z.string().trim().min(5, "Enter a complete address"),
  businessType: z.enum(["Wholesaler", "Distributor", "Manufacturer", "Retailer", "Other"]),
  currency: z.literal("PKR"),
  invoicePrefix: z.string().trim().min(2, "Use at least 2 characters").max(8, "Use 8 characters or fewer").regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers, or hyphens"),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;
const labelClass = "mb-1.5 block text-sm font-medium text-neutral-700";
const selectClass = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";

export default function OnboardingPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting, isSubmitSuccessful } } = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      businessName: DEMO_BUSINESS.name,
      ownerName: DEMO_BUSINESS.ownerName,
      phone: DEMO_BUSINESS.phone,
      city: DEMO_BUSINESS.city,
      address: DEMO_BUSINESS.address,
      businessType: "Wholesaler",
      currency: "PKR",
      invoicePrefix: DEMO_BUSINESS.invoicePrefix,
    },
  });

  async function completeDemo() {
    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[0.75fr_1.25fr]">
        <aside className="relative overflow-hidden bg-blue-600 p-8 text-white sm:p-10">
          <div className="absolute -left-20 top-1/2 size-72 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="relative flex h-full min-h-64 flex-col">
            <p className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-5" />BusinessOS</p>
            <div className="my-auto py-12"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-100">Two-minute setup</p><h1 className="mt-3 text-4xl font-bold leading-tight">Make the workspace yours.</h1><p className="mt-4 leading-7 text-blue-100">Add the details used across your dashboard, invoices, and business assistant.</p></div>
            <p className="text-xs text-blue-100">Demo mode: nothing entered here is persisted.</p>
          </div>
        </aside>

        <section className="p-6 sm:p-10 lg:p-12">
          {isSubmitSuccessful ? (
            <div className="flex min-h-[560px] flex-col items-center justify-center text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-8" /></span>
              <h2 className="mt-6 text-3xl font-bold tracking-tight">Your demo workspace is ready</h2>
              <p className="mt-3 max-w-md text-neutral-500">Setup was completed in demo mode. No business data or account credentials were saved.</p>
              <Button className="mt-8" render={<Link href="/dashboard" />}>Open dashboard <ArrowRight /></Button>
            </div>
          ) : (
            <>
              <div className="mb-8"><p className="text-sm font-medium text-blue-600">Step 1 of 1</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Business details</h2><p className="mt-1 text-sm text-neutral-500">You can change these demo preferences later in Settings.</p></div>
              <form onSubmit={handleSubmit(completeDemo)} className="grid gap-5 sm:grid-cols-2" noValidate>
                <FormField label="Business name" error={errors.businessName?.message}><Input className="h-10" aria-invalid={!!errors.businessName} {...register("businessName")} /></FormField>
                <FormField label="Owner name" error={errors.ownerName?.message}><Input className="h-10" aria-invalid={!!errors.ownerName} {...register("ownerName")} /></FormField>
                <FormField label="Phone number" error={errors.phone?.message}><Input className="h-10" placeholder="0300 1234567" aria-invalid={!!errors.phone} {...register("phone")} /></FormField>
                <FormField label="City" error={errors.city?.message}><Input className="h-10" aria-invalid={!!errors.city} {...register("city")} /></FormField>
                <div className="sm:col-span-2"><FormField label="Business address" error={errors.address?.message}><Input className="h-10" aria-invalid={!!errors.address} {...register("address")} /></FormField></div>
                 <FormField label="Business type" error={errors.businessType?.message}><select className={selectClass} {...register("businessType")}><option>Wholesaler</option><option>Distributor</option><option>Manufacturer</option><option>Retailer</option><option>Other</option></select></FormField>
                <FormField label="Currency" error={errors.currency?.message}><select className={selectClass} {...register("currency")}><option value="PKR">PKR - Pakistani Rupee</option></select></FormField>
                <FormField label="Invoice prefix" error={errors.invoicePrefix?.message}><Input className="h-10 uppercase" aria-invalid={!!errors.invoicePrefix} {...register("invoicePrefix")} /></FormField>
                <Card className="justify-center bg-neutral-50 py-3" size="sm"><CardContent className="text-xs leading-5 text-neutral-500"><Building2 className="mb-1 size-4 text-neutral-700" />Your details stay in this browser preview only.</CardContent></Card>
                <div className="sm:col-span-2 flex items-center justify-between border-t pt-5"><Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-900">Skip demo setup</Link><Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? "Preparing demo..." : "Complete setup"}<ArrowRight /></Button></div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block"><span className={labelClass}>{label}</span>{children}{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</label>;
}
