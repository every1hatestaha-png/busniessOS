import { AlertTriangle, CheckCircle2, CircleDashed, ShieldCheck } from "lucide-react";

import { buildFbrSetupReadiness, type FbrSetupReadinessInput } from "@/lib/fbr/setup-readiness";

export function FbrSetupReadiness(props: FbrSetupReadinessInput) {
  const readiness = buildFbrSetupReadiness(props);

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-950">FBR setup readiness</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">Sandbox prerequisites are checked independently from production transmission approval.</p>
          </div>
        </div>
        <span className={"w-fit rounded-full px-2.5 py-1 text-xs font-semibold " + (readiness.sandboxReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900")}>
          {readiness.completed}/{readiness.total} sandbox prerequisites
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          {readiness.steps.map((step) => (
            <div key={step.id} className={"rounded-xl border p-4 " + (step.ready ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70")}>
              <div className="flex items-start gap-2.5">
                {step.ready
                  ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                  : <CircleDashed className="mt-0.5 size-4 shrink-0 text-amber-700" />}
                <div>
                  <p className="text-xs font-semibold text-slate-900">{step.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{step.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={"flex gap-2 rounded-xl border p-4 text-xs leading-5 " + (readiness.productionRouteReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700")}>
          {readiness.productionRouteReady
            ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <div>
            <p className="font-semibold">Production integration route</p>
            <p className="mt-1">{readiness.productionRouteDetail}</p>
            <p className="mt-1">This records release evidence only. It does not enable production network transmission.</p>
          </div>
        </div>

        <div className={"flex gap-2 rounded-xl border p-4 text-xs leading-5 " + (readiness.productionHsUomReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700")}>
          {readiness.productionHsUomReady
            ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <div>
            <p className="font-semibold">Production HS/UOM gate</p>
            <p className="mt-1">{readiness.productionHsUomDetail}</p>
            <p className="mt-1">This does not enable live FBR transmission; production remains behind the separate compliance approval and deployment kill switch.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
