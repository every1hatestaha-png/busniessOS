"use client";

import { useActionState } from "react";
import { ArrowRight, Building2, Sparkles } from "lucide-react";

import { createWorkspace, type OnboardingState } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initialState: OnboardingState = { error: null };
const labelClass = "mb-1.5 block text-sm font-medium text-neutral-700";
const selectClass = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";

export function OnboardingForm({
  initialValues,
}: {
  initialValues: { email: string; ownerName: string };
}) {
  const [state, formAction, pending] = useActionState(createWorkspace, initialState);

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[0.75fr_1.25fr]">
        <aside className="relative overflow-hidden bg-blue-600 p-8 text-white sm:p-10">
          <div className="absolute -left-20 top-1/2 size-72 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="relative flex h-full min-h-64 flex-col">
            <p className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-5" />BusinessOS</p>
            <div className="my-auto py-12">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-100">Two-minute setup</p>
              <h1 className="mt-3 text-4xl font-bold leading-tight">Make the workspace yours.</h1>
              <p className="mt-4 leading-7 text-blue-100">Add the details used across your dashboard, invoices, and business assistant.</p>
            </div>
            <p className="text-xs text-blue-100">Your workspace is private to authenticated members.</p>
          </div>
        </aside>

        <section className="p-6 sm:p-10 lg:p-12">
          <div className="mb-8">
            <p className="text-sm font-medium text-blue-600">Step 1 of 1</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">Business details</h2>
            <p className="mt-1 text-sm text-neutral-500">These details will be used throughout your workspace.</p>
          </div>

          <form action={formAction} className="grid gap-5 sm:grid-cols-2">
            <FormField label="Business name"><Input name="businessName" className="h-10" minLength={2} maxLength={120} required /></FormField>
            <FormField label="Owner name"><Input name="ownerName" className="h-10" defaultValue={initialValues.ownerName} minLength={2} maxLength={120} required /></FormField>
            <FormField label="Phone number"><Input name="phone" type="tel" className="h-10" placeholder="0300 1234567" minLength={10} maxLength={30} required /></FormField>
            <FormField label="Email"><Input name="email" type="email" className="h-10" defaultValue={initialValues.email} required /></FormField>
            <div className="sm:col-span-2"><FormField label="Business address"><Input name="address" className="h-10" minLength={5} maxLength={300} required /></FormField></div>
            <FormField label="City"><Input name="city" className="h-10" minLength={2} maxLength={80} required /></FormField>
            <FormField label="Country"><Input name="country" className="h-10" defaultValue="Pakistan" minLength={2} maxLength={80} required /></FormField>
            <FormField label="Business type">
              <select name="businessType" className={selectClass} defaultValue="WHOLESALER" required>
                <option value="WHOLESALER">Wholesaler</option>
                <option value="DISTRIBUTOR">Distributor</option>
                <option value="MANUFACTURER">Manufacturer</option>
                <option value="RETAILER">Retailer</option>
                <option value="OTHER">Other</option>
              </select>
            </FormField>
            <FormField label="Currency">
              <select name="currency" className={selectClass} defaultValue="PKR" required>
                <option value="PKR">PKR - Pakistani Rupee</option>
              </select>
            </FormField>
            <input type="hidden" name="timezone" value="Asia/Karachi" />
            <Card className="justify-center bg-neutral-50 py-3 sm:col-span-2" size="sm">
              <CardContent className="flex items-center gap-2 text-xs leading-5 text-neutral-500"><Building2 className="size-4 text-neutral-700" />You will be added as this workspace&apos;s owner.</CardContent>
            </Card>
            {state.error && <p className="sm:col-span-2 text-sm text-red-600" role="alert">{state.error}</p>}
            <div className="sm:col-span-2 flex justify-end border-t pt-5">
              <Button type="submit" size="lg" disabled={pending}>{pending ? "Creating workspace..." : "Complete setup"}<ArrowRight /></Button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className={labelClass}>{label}</span>{children}</label>;
}
