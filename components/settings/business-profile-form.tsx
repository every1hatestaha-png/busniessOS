"use client";

import { useActionState } from "react";
import { Building2, CheckCircle2, MapPin } from "lucide-react";

import { updateWorkspaceProfileAction, type WorkspaceProfileState } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: WorkspaceProfileState = {};

export function BusinessProfileForm({
  workspace,
}: {
  workspace: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    country: string;
    businessType: "WHOLESALER" | "DISTRIBUTOR" | "MANUFACTURER" | "RETAILER" | "OTHER";
  };
}) {
  const [state, formAction, pending] = useActionState(updateWorkspaceProfileAction, initialState);

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b bg-slate-50/70 px-5 py-4">
        <div className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><Building2 className="size-5" /></div>
        <div>
          <h2 className="font-semibold text-slate-950">Business profile</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">These details identify your workspace and are used across business documents and setup.</p>
        </div>
      </div>

      <form action={formAction} className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <Input name="name" defaultValue={workspace.name} minLength={2} maxLength={120} required />
          </Field>
          <Field label="Business type">
            <select name="businessType" defaultValue={workspace.businessType} className="h-9 w-full rounded-md border bg-white px-3 text-sm">
              <option value="RETAILER">Retail</option>
              <option value="WHOLESALER">Wholesale</option>
              <option value="DISTRIBUTOR">Distribution</option>
              <option value="MANUFACTURER">Manufacturing</option>
              <option value="OTHER">Restaurant / Services / Other</option>
            </select>
          </Field>
          <Field label="Phone">
            <Input name="phone" defaultValue={workspace.phone ?? ""} maxLength={30} placeholder="0300 1234567" />
          </Field>
          <Field label="Business email">
            <Input name="email" type="email" defaultValue={workspace.email ?? ""} maxLength={160} placeholder="accounts@business.com" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Business address">
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input name="address" defaultValue={workspace.address ?? ""} maxLength={300} className="pl-9" placeholder="Street, market, plaza or area" />
              </div>
            </Field>
          </div>
          <Field label="City">
            <Input name="city" defaultValue={workspace.city ?? ""} minLength={2} maxLength={80} required />
          </Field>
          <Field label="Country">
            <Input name="country" defaultValue={workspace.country} minLength={2} maxLength={80} required />
          </Field>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm">
            {state.status === "success" && <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="size-4" />{state.message}</span>}
            {state.status === "error" && <span className="text-red-600" role="alert">{state.message}</span>}
          </div>
          <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save business profile"}</Button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>{children}</label>;
}
