"use client";

import { FormEvent, useState } from "react";
import { BellRing, Building2, Check, Link2, MessageCircle, Receipt, Save, ShieldCheck } from "lucide-react";
import { DEMO_BUSINESS } from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const labelClass = "mb-1.5 block text-sm font-medium text-neutral-700";
const selectClass = "h-9 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";

export default function SettingsPage() {
  const [savedSection, setSavedSection] = useState<string>();

  function demoSave(event: FormEvent<HTMLFormElement>, section: string) {
    event.preventDefault();
    setSavedSection(section);
    window.setTimeout(() => setSavedSection(undefined), 2500);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Workspace</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-neutral-500">Manage demo business preferences and see what is coming next.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2"><Building2 className="size-4" />Business profile</CardTitle>
              <CardDescription>Details shown on your workspace and documents.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(event) => demoSave(event, "profile")} className="grid gap-4 sm:grid-cols-2">
                <Field label="Business name" name="businessName" defaultValue={DEMO_BUSINESS.name} />
                <Field label="Owner name" name="ownerName" defaultValue={DEMO_BUSINESS.ownerName} />
                <Field label="Phone" name="phone" defaultValue={DEMO_BUSINESS.phone} />
                <Field label="City" name="city" defaultValue={DEMO_BUSINESS.city} />
                <div className="sm:col-span-2"><Field label="Address" name="address" defaultValue={DEMO_BUSINESS.address} /></div>
                <div className="sm:col-span-2 flex items-center justify-between border-t pt-4">
                  <p className="text-xs text-neutral-500">Demo changes last only until this page reloads.</p>
                  <SaveButton saved={savedSection === "profile"} />
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2"><Receipt className="size-4" />Invoice preferences</CardTitle>
              <CardDescription>Defaults used when preparing invoices.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(event) => demoSave(event, "invoice")} className="grid gap-4 sm:grid-cols-3">
                <Field label="Invoice prefix" name="invoicePrefix" defaultValue={DEMO_BUSINESS.invoicePrefix} />
                <div><label className={labelClass} htmlFor="currency">Currency</label><select id="currency" name="currency" defaultValue={DEMO_BUSINESS.currency} className={selectClass}><option value="PKR">PKR - Pakistani Rupee</option><option value="USD">USD - US Dollar</option></select></div>
                <div><label className={labelClass} htmlFor="paymentTerms">Payment terms</label><select id="paymentTerms" name="paymentTerms" defaultValue="15" className={selectClass}><option value="0">Due on receipt</option><option value="15">Net 15</option><option value="30">Net 30</option></select></div>
                <div className="sm:col-span-3 flex justify-end border-t pt-4"><SaveButton saved={savedSection === "invoice"} /></div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2"><BellRing className="size-4" />Notifications</CardTitle>
              <CardDescription>Choose which demo reminders appear in your workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <Toggle label="Low stock alerts" description="When stock reaches its reorder level" defaultChecked />
              <Toggle label="Overdue invoice reminders" description="Daily reminder for unpaid overdue invoices" defaultChecked />
              <Toggle label="Daily sales summary" description="End-of-day performance summary" />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="bg-neutral-950 text-white ring-0">
            <CardHeader><ShieldCheck className="mb-2 size-6 text-emerald-400" /><CardTitle>Demo workspace</CardTitle><CardDescription className="text-neutral-400">Settings are interactive previews and are not persisted.</CardDescription></CardHeader>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="size-4" />Integrations</CardTitle><CardDescription>Connect the tools you already use.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Integration icon={MessageCircle} name="WhatsApp Business" />
              <Integration icon={Receipt} name="FBR e-Invoicing" />
              <Integration icon={Building2} name="Bank feeds" />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return <div><label className={labelClass} htmlFor={name}>{label}</label><Input id={name} name={name} defaultValue={defaultValue} className="h-9" /></div>;
}

function SaveButton({ saved }: { saved: boolean }) {
  return <Button type="submit" disabled={saved}>{saved ? <><Check />Saved for demo</> : <><Save />Save changes</>}</Button>;
}

function Toggle({ label, description, defaultChecked = false }: { label: string; description: string; defaultChecked?: boolean }) {
  return <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-3 hover:bg-neutral-50"><input type="checkbox" defaultChecked={defaultChecked} className="size-4 accent-neutral-900" /><span className="flex-1"><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-neutral-500">{description}</span></span></label>;
}

function Integration({ icon: Icon, name }: { icon: typeof Link2; name: string }) {
  return <div className="flex items-center gap-3 rounded-lg border p-3"><span className="flex size-8 items-center justify-center rounded-lg bg-neutral-100"><Icon className="size-4" /></span><span className="min-w-0 flex-1 text-sm font-medium">{name}</span><Badge variant="secondary">Coming Soon</Badge></div>;
}
