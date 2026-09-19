"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Factory, MapPin, PackageCheck, ShieldCheck, ShoppingBag, Sparkles, Store, Wrench } from "lucide-react";

import { createWorkspace, type OnboardingState } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BuilderBusinessType, ProvisioningBilling, ProvisioningModuleKey } from "@/lib/saas/provisioning-selection";

const initialState: OnboardingState = { error: null };

type BusinessTypeValue = "WHOLESALER" | "DISTRIBUTOR" | "MANUFACTURER" | "RETAILER" | "OTHER";

const businessTypes = [
  { value: "RETAILER" as const, title: "Retail", description: "Shop, store or counter sales", icon: Store },
  { value: "WHOLESALER" as const, title: "Wholesale", description: "Bulk sales, credit and stock", icon: PackageCheck },
  { value: "DISTRIBUTOR" as const, title: "Distribution", description: "Supply and dealer network", icon: ShoppingBag },
  { value: "MANUFACTURER" as const, title: "Manufacturing", description: "Production and raw materials", icon: Factory },
  { value: "OTHER" as const, title: "Restaurant / Services", description: "Restaurant, workshop or services", icon: Wrench },
];

const citySuggestions = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Gujranwala", "Sialkot", "Peshawar", "Quetta"];

const moduleLabels: Record<ProvisioningModuleKey, string> = {
  inventory: "Inventory",
  restaurant: "Restaurant",
  wholesale: "Wholesale",
  manufacturing: "Manufacturing",
  accounting: "Accounting",
  multiBranch: "Multi-branch",
  payroll: "Payroll",
  integrations: "Integrations",
  services: "Services",
};

export function OnboardingForm({
  initialValues,
  provisioning,
}: {
  initialValues: { email: string; ownerName: string };
  provisioning: {
    builderBusiness: BuilderBusinessType | null;
    modules: ProvisioningModuleKey[];
    billing: ProvisioningBilling;
    businessType: BusinessTypeValue;
  };
}) {
  const [state, formAction, pending] = useActionState(createWorkspace, initialState);
  const [step, setStep] = useState<1 | 2>(1);
  const [businessType, setBusinessType] = useState<BusinessTypeValue>(provisioning.businessType);
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState(initialValues.ownerName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(initialValues.email);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Pakistan");

  const canContinue = businessName.trim().length >= 2 && ownerName.trim().length >= 2 && phone.trim().length >= 10 && email.includes("@");
  const selectedBusiness = businessTypes.find((item) => item.value === businessType) ?? businessTypes[0];

  return (
    <main className="min-h-screen bg-[#f5f7f6] px-4 py-6 text-slate-950 sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_35px_110px_-50px_rgba(15,23,42,.35)] lg:grid lg:min-h-[760px] lg:grid-cols-[390px_1fr]">
        <aside className="relative overflow-hidden bg-[#071821] p-7 text-white sm:p-9 lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(16,185,129,.22),transparent_28%),radial-gradient(circle_at_80%_85%,rgba(16,185,129,.14),transparent_35%)]" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-2 text-lg font-bold">
              <div className="grid size-9 place-items-center rounded-xl bg-emerald-500 text-slate-950"><Sparkles className="size-4" /></div>
              MunshiOS
            </div>

            <div className="mt-12">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">Workspace setup</p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.04em]">Your business. Your Munshi.</h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">Add the details that will appear across your dashboard, invoices, reports and business documents.</p>
            </div>

            <div className="mt-9 space-y-3">
              <ProgressItem number="1" title="Business identity" active={step === 1} complete={step === 2} />
              <ProgressItem number="2" title="Location and setup" active={step === 2} complete={false} />
            </div>

            <div className="mt-9 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Your selected setup</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
                  <selectedBusiness.icon className="size-5" />
                </div>
                <div>
                  <p className="font-semibold">{selectedBusiness.title}</p>
                  <p className="text-xs text-slate-400">{provisioning.billing === "annual" ? "Annual" : "Monthly"} billing preference</p>
                </div>
              </div>
              {provisioning.modules.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {provisioning.modules.slice(0, 5).map((module) => (
                    <span key={module} className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] text-slate-300">{moduleLabels[module]}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-auto pt-10">
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                <p className="text-xs leading-5 text-slate-300">Your workspace stays separated from other businesses and only authenticated members can access it.</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="p-5 sm:p-8 lg:p-12 xl:p-14">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Step {step} of 2</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">{step === 1 ? "Tell us about your business" : "Finish your business profile"}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{step === 1 ? "This takes about a minute. You can update most business information later." : "These details help MunshiOS format your workspace and business documents correctly."}</p>
              </div>
            </div>

            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={step === 1 ? "h-full w-1/2 rounded-full bg-emerald-500 transition-all" : "h-full w-full rounded-full bg-emerald-500 transition-all"} />
            </div>

            <form action={formAction} className="mt-9">
              <input type="hidden" name="businessType" value={businessType} />
              <input type="hidden" name="currency" value="PKR" />
              <input type="hidden" name="timezone" value="Asia/Karachi" />
              <input type="hidden" name="selectedModules" value={provisioning.modules.join(",")} />
              <input type="hidden" name="billing" value={provisioning.billing} />
              <input type="hidden" name="builderBusiness" value={provisioning.builderBusiness ?? ""} />

              {step === 1 ? (
                <div className="space-y-8">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Business name" hint="The name customers see on documents">
                      <Input name="businessName" value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="h-11" placeholder="e.g. Pak Star Traders" minLength={2} maxLength={120} required />
                    </Field>
                    <Field label="Owner name" hint="Primary owner or operator">
                      <Input name="ownerName" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} className="h-11" placeholder="Your full name" minLength={2} maxLength={120} required />
                    </Field>
                    <Field label="Phone number" hint="Used for your business profile">
                      <Input name="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="h-11" placeholder="0300 1234567" minLength={10} maxLength={30} required />
                    </Field>
                    <Field label="Email" hint="Your signed-in email is filled automatically">
                      <Input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11" placeholder="owner@business.com" required />
                    </Field>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-800">What type of business is this?</p>
                    <p className="mt-1 text-xs text-slate-500">We use this to tune the default workspace experience.</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {businessTypes.map(({ value, title, description, icon: Icon }) => {
                        const selected = businessType === value;
                        const cardClass = selected ? "relative rounded-2xl border border-emerald-500 bg-emerald-50 p-4 text-left shadow-sm" : "relative rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50";
                        const iconClass = selected ? "grid size-10 place-items-center rounded-xl bg-emerald-600 text-white" : "grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-600";
                        return (
                          <button key={value} type="button" onClick={() => setBusinessType(value)} className={cardClass}>
                            {selected && <div className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-emerald-600 text-white"><Check className="size-3" /></div>}
                            <div className={iconClass}><Icon className="size-4" /></div>
                            <p className="mt-4 text-sm font-semibold">{title}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end border-t border-slate-100 pt-6">
                    <Button type="button" size="lg" disabled={!canContinue} onClick={() => setStep(2)}>Continue <ArrowRight className="size-4" /></Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex items-start gap-3">
                      <Building2 className="mt-0.5 size-5 text-emerald-700" />
                      <div>
                        <p className="font-semibold text-emerald-950">{businessName || "Your business"}</p>
                        <p className="mt-1 text-xs leading-5 text-emerald-800">You are setting this up as a {selectedBusiness.title.toLowerCase()} business. You will be the workspace owner.</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field label="Business address" hint="Street, market, plaza or area">
                        <div className="relative">
                          <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                          <Input name="address" value={address} onChange={(event) => setAddress(event.target.value)} className="h-11 pl-9" placeholder="e.g. Main Boulevard, Johar Town" minLength={5} maxLength={300} required />
                        </div>
                      </Field>
                    </div>
                    <Field label="City" hint="Start typing or choose a common city">
                      <Input name="city" value={city} onChange={(event) => setCity(event.target.value)} list="pakistan-cities" className="h-11" placeholder="Lahore" minLength={2} maxLength={80} required />
                      <datalist id="pakistan-cities">{citySuggestions.map((item) => <option key={item} value={item} />)}</datalist>
                    </Field>
                    <Field label="Country" hint="Defaulted for your current setup">
                      <Input name="country" value={country} onChange={(event) => setCountry(event.target.value)} className="h-11" minLength={2} maxLength={80} required />
                    </Field>
                  </div>

                  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                    <SummaryItem label="Currency" value="PKR" />
                    <SummaryItem label="Timezone" value="Asia/Karachi" />
                    <SummaryItem label="Billing" value={provisioning.billing === "annual" ? "Annual" : "Monthly"} />
                  </div>

                  {state.error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>}

                  <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)} disabled={pending}><ArrowLeft className="size-4" /> Back</Button>
                    <Button type="submit" size="lg" disabled={pending || address.trim().length < 5 || city.trim().length < 2 || country.trim().length < 2}>
                      {pending ? "Creating your workspace..." : "Create my workspace"} <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProgressItem({ number, title, active, complete }: { number: string; title: string; active: boolean; complete: boolean }) {
  const boxClass = active ? "flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] p-3" : "flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3";
  const numberClass = complete ? "grid size-8 place-items-center rounded-lg bg-emerald-500 text-xs font-bold text-slate-950" : active ? "grid size-8 place-items-center rounded-lg bg-white text-xs font-bold text-slate-950" : "grid size-8 place-items-center rounded-lg bg-white/10 text-xs font-bold text-slate-300";
  return <div className={boxClass}><div className={numberClass}>{complete ? <Check className="size-4" /> : number}</div><p className={active || complete ? "text-sm font-medium text-white" : "text-sm font-medium text-slate-400"}>{title}</p></div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-sm font-semibold text-slate-800">{label}</span>{hint && <span className="mb-2 mt-1 block text-xs text-slate-500">{hint}</span>}{children}</label>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>;
}
