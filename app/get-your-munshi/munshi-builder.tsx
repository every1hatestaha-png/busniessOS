"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Factory,
  PackageCheck,
  ShieldCheck,
  Store,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

import { buildProvisioningQuery } from "@/lib/saas/provisioning-selection";

type BusinessType = "retail" | "restaurant" | "wholesale" | "manufacturing" | "services";

type ModuleKey =
  | "inventory"
  | "restaurant"
  | "wholesale"
  | "manufacturing"
  | "accounting"
  | "multiBranch"
  | "payroll"
  | "integrations";

const MONTHLY_PRICE = 5000;
const IMPLEMENTATION_PRICE = 29000;

const modules: Array<{
  key: ModuleKey;
  name: string;
  description: string;
}> = [
  { key: "inventory", name: "Inventory & Warehouse", description: "Stock, purchasing, receiving, returns and warehouse visibility." },
  { key: "wholesale", name: "Wholesale & Distribution", description: "GRN, credit sales, supplier flows, allocations and distribution workflows." },
  { key: "manufacturing", name: "Manufacturing", description: "Raw materials, BOMs, production, wastage and finished goods." },
  { key: "accounting", name: "Advanced Accounting", description: "GST, WHT, receivables, payables, journals and advanced financial reporting." },
  { key: "multiBranch", name: "Multi-Branch", description: "Separate branches with consolidated owner-level reporting." },
  { key: "payroll", name: "Payroll & HR", description: "Employees, payroll, attendance and staff records." },
  { key: "integrations", name: "Integrations", description: "Connect external services, online ordering or custom business tools." },
];

const businessTypes: Array<{
  key: BusinessType;
  name: string;
  subtitle: string;
  icon: typeof Store;
  recommended: ModuleKey[];
}> = [
  { key: "retail", name: "Retail Shop", subtitle: "Stores, pharmacies, showrooms and general retail", icon: Store, recommended: ["inventory"] },
  { key: "restaurant", name: "Restaurant / Cafe", subtitle: "POS, table orders, kitchen and ingredient stock", icon: UtensilsCrossed, recommended: ["inventory", "restaurant"] },
  { key: "wholesale", name: "Wholesale / Distribution", subtitle: "Trading, auto parts, distributors and wholesalers", icon: PackageCheck, recommended: ["inventory", "wholesale", "accounting"] },
  { key: "manufacturing", name: "Manufacturing / Factory", subtitle: "Factories, production units and engineering businesses", icon: Factory, recommended: ["inventory", "wholesale", "manufacturing", "accounting"] },
  { key: "services", name: "Services", subtitle: "Workshops, agencies and professional service teams", icon: Wrench, recommended: ["accounting"] },
];

const coreFeatures = ["Sales & purchases", "Customers & suppliers", "Khata & payments", "Expenses", "Professional documents", "Basic business reports", "Roles & permissions"];

export function MunshiBuilder() {
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>([]);
  const billing = "monthly" as const;
  const monthlyTotal = MONTHLY_PRICE;

  function chooseBusiness(type: BusinessType, recommended: ModuleKey[]) {
    setBusinessType(type);
    setSelectedModules(recommended);
    setStep(2);
  }

  function isRequiredModule(key: ModuleKey) {
    return (key === "inventory" && (businessType === "restaurant" || businessType === "wholesale" || businessType === "manufacturing"))
      || (key === "wholesale" && businessType === "manufacturing");
  }

  function toggleModule(key: ModuleKey) {
    if (isRequiredModule(key)) return;
    setSelectedModules((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  const selectedBusiness = businessTypes.find((type) => type.key === businessType);
  const checkoutHref = businessType
    ? `/sign-up?${buildProvisioningQuery({ businessType, modules: selectedModules, billing })}`
    : "/sign-up";

  return (
    <section className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-14">
      <div className="mb-10 flex items-center gap-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="flex flex-1 items-center gap-3">
            <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${step >= item ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>
              {step > item ? <Check className="h-4 w-4" /> : item}
            </div>
            <div className={`hidden h-px flex-1 sm:block ${item < 3 ? (step > item ? "bg-emerald-300" : "bg-slate-200") : "bg-transparent"}`} />
          </div>
        ))}
      </div>

      {step === 1 && (
        <div>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-emerald-700">Step 1 of 3</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">What kind of Munshi do you need?</h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">Choose the closest business type. We will prepare a recommended setup, and you can adjust your setup before creating your account.</p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {businessTypes.map(({ key, name, subtitle, icon: Icon, recommended }) => (
              <button
                key={key}
                type="button"
                onClick={() => chooseBusiness(key, recommended)}
                className="group flex items-center gap-5 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-950 text-white transition group-hover:bg-emerald-600"><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{name}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-emerald-600" />
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && selectedBusiness && (
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div>
            <button type="button" onClick={() => setStep(1)} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" /> Change business type
            </button>
            <p className="text-sm font-semibold text-emerald-700">Step 2 of 3</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Customize your {selectedBusiness.name} Munshi</h1>
            <p className="mt-3 max-w-2xl text-slate-600">We selected relevant modules for your industry. Required dependencies stay on, and you can customize optional modules.</p>

            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm"><Building2 className="h-5 w-5" /></div>
                <div>
                  <p className="font-semibold">Munshi Core</p>
                  <p className="text-sm text-slate-600">Core subscription — Rs {MONTHLY_PRICE.toLocaleString()}/month</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {coreFeatures.map((feature) => <span key={feature} className="rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-600 shadow-sm">{feature}</span>)}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {modules.map((module) => {
                const active = selectedModules.includes(module.key);
                const required = isRequiredModule(module.key);
                return (
                  <button
                    key={module.key}
                    type="button"
                    onClick={() => toggleModule(module.key)}
                    disabled={required}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition ${active ? "border-emerald-300 bg-white shadow-sm" : "border-slate-200 bg-white/60 hover:bg-white"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{module.name}</h3>
                        {required ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Required</span> : selectedBusiness.recommended.includes(module.key) ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Recommended</span> : null}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{module.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{required ? "Required" : active ? "Included" : "Optional"}</p>
                      <div className={`ml-auto mt-2 flex h-6 w-11 items-center rounded-full p-1 transition ${active ? "justify-end bg-emerald-600" : "justify-start bg-slate-200"}`}>
                        <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Your Munshi</p>
              <h2 className="mt-2 text-xl font-semibold">{selectedBusiness.name}</h2>
              <div className="mt-6 space-y-3 border-y border-white/10 py-5 text-sm">
                <div className="flex justify-between gap-4"><span className="text-slate-400">Munshi Core</span><span>Rs {MONTHLY_PRICE.toLocaleString()}/mo</span></div>
                {modules.filter((module) => selectedModules.includes(module.key)).map((module) => (
                  <div key={module.key} className="flex justify-between gap-4"><span className="text-slate-400">{module.name}</span><span>Included</span></div>
                ))}
              </div>
              <div className="flex items-end justify-between gap-3 pt-5">
                <span className="text-sm text-slate-400">Monthly subscription</span>
                <span className="text-2xl font-semibold">Rs {monthlyTotal.toLocaleString()}</span>
              </div>
              <button type="button" onClick={() => setStep(3)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                Review setup <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </aside>
        </div>
      )}

      {step === 3 && selectedBusiness && (
        <div className="mx-auto max-w-4xl">
          <button type="button" onClick={() => setStep(2)} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Edit modules
          </button>
          <p className="text-sm font-semibold text-emerald-700">Step 3 of 3</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your Munshi is ready.</h1>
          <p className="mt-3 text-lg text-slate-600">Review the modules you need and the published prices before creating your MunshiOS account.</p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_330px]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="font-semibold">Transparent pricing</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-[#fbfcfa] p-4">
                    <p className="text-xs text-slate-500">One-time implementation</p>
                    <p className="mt-2 text-xl font-semibold">Rs {IMPLEMENTATION_PRICE.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs text-emerald-800">Ongoing subscription</p>
                    <p className="mt-2 text-xl font-semibold">Rs {monthlyTotal.toLocaleString()}/month</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">Your module choices shape the onboarding configuration. There is no separate module charge in the advertised subscription.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="font-semibold">What happens next?</h2>
                <div className="mt-4 space-y-4 text-sm text-slate-600">
                  <div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">1</span><p>Create your secure MunshiOS account.</p></div>
                  <div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">2</span><p>Your 30-day trial starts and your selected workspace is provisioned.</p></div>
                  <div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">3</span><p>When you are ready, request paid activation from Subscription; online checkout will use the same flow once enabled.</p></div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl lg:self-start">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-slate-950"><ShieldCheck className="h-5 w-5" /></div>
                <div><p className="text-xs text-slate-400">Your setup</p><p className="font-semibold">{selectedBusiness.name}</p></div>
              </div>
              <div className="mt-6 space-y-3 border-y border-white/10 py-5 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Munshi Core</span><Check className="h-4 w-4 text-emerald-400" /></div>
                {modules.filter((module) => selectedModules.includes(module.key)).map((module) => (
                  <div key={module.key} className="flex justify-between gap-3"><span className="text-slate-400">{module.name}</span><Check className="h-4 w-4 shrink-0 text-emerald-400" /></div>
                ))}
              </div>
              <div className="pt-5">
                <p className="text-xs text-slate-400">Monthly subscription after trial</p>
                <p className="mt-1 text-3xl font-semibold">Rs {monthlyTotal.toLocaleString()}</p>
                <p className="mt-2 text-xs text-emerald-300">Rs {IMPLEMENTATION_PRICE.toLocaleString()} one-time implementation</p>
              </div>
              <Link href={checkoutHref} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                Create account & continue <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">No card is charged during the 30-day trial. Paid activation uses the existing MunshiOS owner approval flow. Online checkout is not yet available.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
