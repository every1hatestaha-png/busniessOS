"use client";

import { useActionState, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Factory,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

import { createWorkspace, type OnboardingState } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BuilderBusinessType, ProvisioningBilling, ProvisioningModuleKey } from "@/lib/saas/provisioning-selection";
import { cn } from "@/lib/utils";

const initialState: OnboardingState = { error: null };

type BusinessTypeValue = "WHOLESALER" | "DISTRIBUTOR" | "MANUFACTURER" | "RETAILER" | "OTHER";
type SetupKey = "retail" | "restaurant" | "wholesale" | "distribution" | "manufacturing" | "other";

const businessTypes: Array<{
  key: SetupKey;
  value: BusinessTypeValue;
  builderBusiness: BuilderBusinessType | null;
  modules: ProvisioningModuleKey[];
  title: string;
  description: string;
  icon: typeof Store;
}> = [
  { key: "retail", value: "RETAILER", builderBusiness: "retail", modules: ["inventory"], title: "Retail", description: "Shop, store or counter sales", icon: Store },
  { key: "restaurant", value: "OTHER", builderBusiness: "restaurant", modules: ["inventory", "restaurant"], title: "Restaurant", description: "POS, tables, kitchen and ingredients", icon: UtensilsCrossed },
  { key: "wholesale", value: "WHOLESALER", builderBusiness: "wholesale", modules: ["inventory", "wholesale", "accounting"], title: "Wholesale", description: "Bulk sales, credit and stock", icon: PackageCheck },
  { key: "distribution", value: "DISTRIBUTOR", builderBusiness: null, modules: ["inventory", "wholesale", "accounting"], title: "Distribution", description: "Supply and dealer network", icon: ShoppingBag },
  { key: "manufacturing", value: "MANUFACTURER", builderBusiness: "manufacturing", modules: ["inventory", "wholesale", "manufacturing", "accounting"], title: "Manufacturing", description: "Production and raw materials", icon: Factory },
  { key: "other", value: "OTHER", builderBusiness: null, modules: ["accounting"], title: "Other business", description: "General ERP workspace", icon: Wrench },
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

function initialSetupKey(provisioning: {
  builderBusiness: BuilderBusinessType | null;
  businessType: BusinessTypeValue;
}) : SetupKey {
  if (provisioning.builderBusiness === "restaurant") return "restaurant";
  if (provisioning.builderBusiness === "retail") return "retail";
  if (provisioning.builderBusiness === "wholesale") return "wholesale";
  if (provisioning.builderBusiness === "manufacturing") return "manufacturing";
  if (provisioning.businessType === "DISTRIBUTOR") return "distribution";
  if (provisioning.businessType === "OTHER") return "other";
  if (provisioning.businessType === "RETAILER") return "retail";
  if (provisioning.businessType === "MANUFACTURER") return "manufacturing";
  return "wholesale";
}

export function OnboardingForm({
  initialValues,
  provisioning,
  createAdditional = false,
}: {
  initialValues: { email: string; ownerName: string };
  createAdditional?: boolean;
  provisioning: {
    builderBusiness: BuilderBusinessType | null;
    modules: ProvisioningModuleKey[];
    billing: ProvisioningBilling;
    businessType: BusinessTypeValue;
  };
}) {
  const [state, formAction, pending] = useActionState(createWorkspace, initialState);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedKey, setSelectedKey] = useState<SetupKey>(initialSetupKey(provisioning));
  const initialCard = businessTypes.find((item) => item.key === initialSetupKey(provisioning)) ?? businessTypes[0];
  const [businessType, setBusinessType] = useState<BusinessTypeValue>(provisioning.businessType);
  const [builderBusiness, setBuilderBusiness] = useState<BuilderBusinessType | null>(provisioning.builderBusiness);
  const [selectedModules, setSelectedModules] = useState<ProvisioningModuleKey[]>(
    provisioning.modules.length ? provisioning.modules : initialCard.modules,
  );

  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState(initialValues.ownerName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(initialValues.email);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Pakistan");

  const canContinue = businessName.trim().length >= 2 && ownerName.trim().length >= 2 && phone.trim().length >= 10 && email.includes("@");
  const selectedBusiness = businessTypes.find((item) => item.key === selectedKey) ?? businessTypes[0];
  const isRestaurant = selectedKey === "restaurant";

  function selectBusiness(key: SetupKey) {
    const selected = businessTypes.find((item) => item.key === key);
    if (!selected) return;
    setSelectedKey(key);
    setBusinessType(selected.value);
    setBuilderBusiness(selected.builderBusiness);
    setSelectedModules(selected.modules);
  }

  return (
    <main className="min-h-dvh bg-[#f5f7f6] px-3 py-3 text-slate-950 sm:px-5 sm:py-5">
      <div className="mx-auto grid max-w-[1220px] overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_30px_90px_-45px_rgba(15,23,42,.28)] lg:min-h-[700px] lg:grid-cols-[340px_1fr]">
        <aside className="relative overflow-hidden bg-[#071821] px-6 py-6 text-white sm:px-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,.18),transparent_28%),radial-gradient(circle_at_80%_90%,rgba(16,185,129,.10),transparent_38%)]" />
          <div className="relative flex h-full flex-col">
            <button type="button" onClick={() => step === 2 ? setStep(1) : window.history.back()} className="mb-6 inline-flex w-fit items-center gap-2 text-xs font-medium text-slate-400 transition hover:text-white">
              <ArrowLeft className="size-4" /> Back
            </button>

            <div className="flex items-center gap-2 text-lg font-bold">
              <div className="grid size-9 place-items-center rounded-xl bg-emerald-500 text-slate-950"><Sparkles className="size-4" /></div>
              MunshiOS
            </div>

            <div className="mt-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">{isRestaurant ? "Restaurant setup" : createAdditional ? "Add business" : "Workspace setup"}</p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.04em]">
                {isRestaurant ? "Set up your restaurant." : createAdditional ? "Add another business." : "Your business. Your Munshi."}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {isRestaurant
                  ? "Two quick steps to prepare POS, tables, kitchen and stock."
                  : "Add the core details for your dashboard, documents and workspace."}
              </p>
            </div>

            <div className="mt-7 space-y-2.5">
              <ProgressItem number="1" title={isRestaurant ? "Restaurant details" : "Business identity"} active={step === 1} complete={step === 2} />
              <ProgressItem number="2" title={isRestaurant ? "Location & service" : "Location and setup"} active={step === 2} complete={false} />
            </div>

            <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Selected setup</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
                  <selectedBusiness.icon className="size-5" />
                </div>
                <div>
                  <p className="font-semibold">{selectedBusiness.title}</p>
                  <p className="text-xs text-slate-400">{provisioning.billing === "annual" ? "Annual" : "Monthly"} billing preference</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selectedModules.slice(0, 5).map((module) => (
                  <span key={module} className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] text-slate-300">{moduleLabels[module]}</span>
                ))}
              </div>
            </div>

            <div className="mt-auto pt-6">
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                <p className="text-[11px] leading-5 text-slate-300">Workspace data stays tenant-isolated and accessible only to authenticated members.</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[790px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-emerald-700">Step {step} of 2</p>
                <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.035em] sm:text-[28px]">
                  {step === 1
                    ? isRestaurant ? "Tell us about your restaurant" : "Tell us about your business"
                    : isRestaurant ? "Where do you operate?" : "Finish your business profile"}
                </h2>
                <p className="mt-1.5 text-sm leading-5 text-slate-500">
                  {step === 1
                    ? "This takes about a minute. You can update most details later."
                    : "These details help MunshiOS format your workspace correctly."}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold tracking-wide text-emerald-700">STEP {step} OF 2</span>
            </div>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={step === 1 ? "h-full w-1/2 rounded-full bg-emerald-500 transition-all" : "h-full w-full rounded-full bg-emerald-500 transition-all"} />
            </div>

            <form action={formAction} className="mt-6">
              <input type="hidden" name="businessType" value={businessType} />
              <input type="hidden" name="currency" value="PKR" />
              <input type="hidden" name="timezone" value="Asia/Karachi" />
              <input type="hidden" name="selectedModules" value={selectedModules.join(",")} />
              <input type="hidden" name="billing" value={provisioning.billing} />
              <input type="hidden" name="builderBusiness" value={builderBusiness ?? ""} />
              <input type="hidden" name="creationMode" value={createAdditional ? "additional" : "initial"} />

              {step === 2 && (
                <>
                  <input type="hidden" name="businessName" value={businessName} />
                  <input type="hidden" name="ownerName" value={ownerName} />
                  <input type="hidden" name="phone" value={phone} />
                  <input type="hidden" name="email" value={email} />
                </>
              )}

              {step === 1 ? (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={isRestaurant ? "Restaurant name" : "Business name"}>
                      <Input name="businessName" value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="h-10 rounded-xl" placeholder={isRestaurant ? "e.g. Crust" : "e.g. Pak Star Traders"} minLength={2} maxLength={120} required />
                    </Field>
                    <Field label="Owner / operator">
                      <Input name="ownerName" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} className="h-10 rounded-xl" placeholder="Your full name" minLength={2} maxLength={120} required />
                    </Field>
                    <Field label="Phone number">
                      <Input name="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="h-10 rounded-xl" placeholder="0300 1234567" minLength={10} maxLength={30} required />
                    </Field>
                    <Field label="Email">
                      <Input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 rounded-xl" placeholder="owner@business.com" required />
                    </Field>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-800">What type of business is this?</p>
                    <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {businessTypes.map(({ key, title, description, icon: Icon }) => {
                        const selected = selectedKey === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => selectBusiness(key)}
                            className={cn(
                              "relative min-h-[104px] rounded-2xl border p-3.5 text-left transition",
                              selected ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                            )}
                          >
                            {selected && <div className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-emerald-600 text-white"><Check className="size-3" /></div>}
                            <div className={cn("grid size-9 place-items-center rounded-xl", selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600")}><Icon className="size-4" /></div>
                            <p className="mt-3 text-sm font-semibold">{title}</p>
                            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {isRestaurant && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                      <p className="text-xs font-semibold text-emerald-900">Restaurant workspace includes</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {["POS", "Tables", "Kitchen display", "Inventory", "Cash closing"].map((item) => (
                          <span key={item} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-emerald-800">✓ {item}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end border-t border-slate-100 pt-4">
                    <Button type="button" className="rounded-xl" disabled={!canContinue} onClick={() => setStep(2)}>Continue <ArrowRight className="size-4" /></Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field label={isRestaurant ? "Restaurant address" : "Business address"}>
                        <div className="relative">
                          <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                          <Input name="address" value={address} onChange={(event) => setAddress(event.target.value)} className="h-10 rounded-xl pl-9" placeholder="e.g. Main Boulevard, Johar Town" minLength={5} maxLength={300} required />
                        </div>
                      </Field>
                    </div>
                    <Field label="City">
                      <Input name="city" value={city} onChange={(event) => setCity(event.target.value)} list="pakistan-cities" className="h-10 rounded-xl" placeholder="Lahore" minLength={2} maxLength={80} required />
                      <datalist id="pakistan-cities">{citySuggestions.map((item) => <option key={item} value={item} />)}</datalist>
                    </Field>
                    <Field label="Country">
                      <Input name="country" value={country} onChange={(event) => setCountry(event.target.value)} className="h-10 rounded-xl" minLength={2} maxLength={80} required />
                    </Field>
                  </div>

                  <div className="grid gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-3">
                    <SummaryItem label="Currency" value="PKR" />
                    <SummaryItem label="Timezone" value="Asia/Karachi" />
                    <SummaryItem label="Setup" value={selectedBusiness.title} />
                  </div>

                  {state.error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>}

                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep(1)} disabled={pending}><ArrowLeft className="size-4" /> Back</Button>
                    <Button type="submit" className="rounded-xl" disabled={pending || address.trim().length < 5 || city.trim().length < 2 || country.trim().length < 2}>
                      {pending ? "Creating workspace..." : isRestaurant ? "Create restaurant workspace" : "Create workspace"} <ArrowRight className="size-4" />
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
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border p-3", active ? "border-emerald-400/25 bg-emerald-400/[0.08]" : "border-white/10 bg-white/[0.03]")}>
      <div className={cn("grid size-8 place-items-center rounded-lg text-xs font-bold", complete ? "bg-emerald-500 text-slate-950" : active ? "bg-white text-slate-950" : "bg-white/10 text-slate-300")}>{complete ? <Check className="size-4" /> : number}</div>
      <p className={cn("text-sm font-medium", active || complete ? "text-white" : "text-slate-400")}>{title}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-800">{label}</span>{children}</label>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>;
}
