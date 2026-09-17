"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

const BASE_PRICE = 2990;

const modules: Array<{
  key: ModuleKey;
  name: string;
  description: string;
  price: number;
}> = [
  { key: "inventory", name: "Inventory & Warehouse", description: "Stock, purchasing, receiving, returns and warehouse visibility.", price: 1500 },
  { key: "restaurant", name: "Restaurant Operations", description: "Tables, orders, kitchen workflow, recipes and cash closing.", price: 4000 },
  { key: "wholesale", name: "Wholesale & Distribution", description: "GRN, credit sales, supplier flows, allocations and distribution workflows.", price: 2000 },
  { key: "manufacturing", name: "Manufacturing", description: "Raw materials, BOMs, production, wastage and finished goods.", price: 6000 },
  { key: "accounting", name: "Advanced Accounting", description: "GST, WHT, receivables, payables, journals and advanced financial reporting.", price: 1500 },
  { key: "multiBranch", name: "Multi-Branch", description: "Separate branches with consolidated owner-level reporting.", price: 2500 },
  { key: "payroll", name: "Payroll & HR", description: "Employees, payroll, attendance and staff records.", price: 1500 },
  { key: "integrations", name: "Integrations", description: "Connect external services, online ordering or custom business tools.", price: 2000 },
];

const businessTypes: Array<{
  key: BusinessType;
  name: string;
  subtitle: string;
  icon: typeof Store;
  recommended: ModuleKey[];
}> = [
  { key: "retail", name: "Retail Shop", subtitle: "Stores, pharmacies, showrooms and general retail", icon: Store, recommended: ["inventory"] },
  { key: "restaurant", name: "Restaurant", subtitle: "Restaurants, cafes, bakeries and food businesses", icon: UtensilsCrossed, recommended: ["inventory", "restaurant"] },
  { key: "wholesale", name: "Wholesale / Distribution", subtitle: "Trading, auto parts, distributors and wholesalers", icon: PackageCheck, recommended: ["inventory", "wholesale", "accounting"] },
  { key: "manufacturing", name: "Manufacturing / Factory", subtitle: "Factories, production units and engineering businesses", icon: Factory, recommended: ["inventory", "wholesale", "manufacturing", "accounting"] },
  { key: "services", name: "Services", subtitle: "Agencies, workshops and service businesses", icon: Wrench, recommended: ["accounting"] },
];

const coreFeatures = ["Sales & purchases", "Customers & suppliers", "Khata & payments", "Expenses", "Professional documents", "Basic business reports", "Roles & permissions"];

export function MunshiBuilder() {
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>([]);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const monthlyTotal = useMemo(() => {
    return BASE_PRICE + modules.filter((module) => selectedModules.includes(module.key)).reduce((sum, module) => sum + module.price, 0);
  }, [selectedModules]);

  const payableNow = billing === "annual" ? monthlyTotal * 10 : monthlyTotal;

  function chooseBusiness(type: BusinessType, recommended: ModuleKey[]) {
    setBusinessType(type);
    setSelectedModules(recommended);
    setStep(2);
  }

  function toggleModule(key: ModuleKey) {
    setSelectedModules((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  const selectedBusiness = businessTypes.find((type) => type.key === businessType);

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
            <p className="mt-4 text-lg leading-8 text-slate-600">Choose the closest business type. We will prepare a recommended setup, and you can change every module before paying.</p>
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
            <p className="mt-3 max-w-2xl text-slate-600">We switched on the modules we recommend. Remove anything you do not need or add more capabilities now.</p>

            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm"><Building2 className="h-5 w-5" /></div>
                <div>
                  <p className="font-semibold">Munshi Core</p>
                  <p className="text-sm text-slate-600">Always included — Rs {BASE_PRICE.toLocaleString()}/month</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {coreFeatures.map((feature) => <span key={feature} className="rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-600 shadow-sm">{feature}</span>)}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {modules.map((module) => {
                const active = selectedModules.includes(module.key);
                return (
                  <button
                    key={module.key}
                    type="button"
                    onClick={() => toggleModule(module.key)}
                    className={`flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition ${active ? "border-emerald-300 bg-white shadow-sm" : "border-slate-200 bg-white/60 hover:bg-white"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{module.name}</h3>
                        {selectedBusiness.recommended.includes(module.key) && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Recommended</span>}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{module.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">+ Rs {module.price.toLocaleString()}</p>
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
                <div className="flex justify-between gap-4"><span className="text-slate-400">Munshi Core</span><span>Rs {BASE_PRICE.toLocaleString()}</span></div>
                {modules.filter((module) => selectedModules.includes(module.key)).map((module) => (
                  <div key={module.key} className="flex justify-between gap-4"><span className="text-slate-400">{module.name}</span><span>Rs {module.price.toLocaleString()}</span></div>
                ))}
              </div>
              <div className="flex items-end justify-between gap-3 pt-5">
                <span className="text-sm text-slate-400">Monthly total</span>
                <span className="text-2xl font-semibold">Rs {monthlyTotal.toLocaleString()}</span>
              </div>
              <button type="button" onClick={() => setStep(3)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                Review & payment <ArrowRight className="h-4 w-4" />
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
          <p className="mt-3 text-lg text-slate-600">Review your configuration and billing choice before creating your MunshiOS account.</p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_330px]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="font-semibold">Billing</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => setBilling("monthly")} className={`rounded-xl border p-4 text-left ${billing === "monthly" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                    <p className="font-semibold">Monthly</p>
                    <p className="mt-1 text-sm text-slate-500">Rs {monthlyTotal.toLocaleString()} every month</p>
                  </button>
                  <button type="button" onClick={() => setBilling("annual")} className={`rounded-xl border p-4 text-left ${billing === "annual" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                    <div className="flex items-center justify-between gap-2"><p className="font-semibold">Annual</p><span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">2 MONTHS FREE</span></div>
                    <p className="mt-1 text-sm text-slate-500">Rs {(monthlyTotal * 10).toLocaleString()} per year</p>
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="font-semibold">What happens next?</h2>
                <div className="mt-4 space-y-4 text-sm text-slate-600">
                  <div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">1</span><p>Create your secure MunshiOS account.</p></div>
                  <div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">2</span><p>Complete payment through the available checkout method.</p></div>
                  <div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">3</span><p>Your workspace opens with these modules enabled for your business.</p></div>
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
                <p className="text-xs text-slate-400">{billing === "annual" ? "Due yearly" : "Due monthly"}</p>
                <p className="mt-1 text-3xl font-semibold">Rs {payableNow.toLocaleString()}</p>
                {billing === "annual" && <p className="mt-1 text-xs text-emerald-400">You save Rs {(monthlyTotal * 2).toLocaleString()} yearly</p>}
              </div>
              <Link href="/sign-up" className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                Create account & continue <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">The live payment gateway will be connected to this checkout before paid subscriptions are activated.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
