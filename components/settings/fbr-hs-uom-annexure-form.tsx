"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

import {
  confirmFbrHsUomAnnexureAction,
  type FbrHsUomAnnexureState,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: FbrHsUomAnnexureState = {};

function dateLabel(value: string | null) {
  if (!value) return "Not confirmed";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function FbrHsUomAnnexureForm({
  config,
}: {
  config: {
    annexureId: number | null;
    confirmedAt: string | null;
    confirmedBy: string | null;
    reference: string | null;
  } | null;
}) {
  const [state, action, pending] = useActionState(confirmFbrHsUomAnnexureAction, initialState);
  const confirmed = Boolean(config?.annexureId && config.confirmedAt && config.confirmedBy);

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b bg-slate-50/70 px-5 py-4">
        <div className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-800"><ShieldAlert className="size-5" /></div>
        <div>
          <h2 className="font-semibold text-slate-950">FBR HS/UOM sales-annexure confirmation</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">The FBR HS_UOM API requires a sales-annexure ID. MunshiOS will never infer or default this value.</p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className={"rounded-xl border p-4 text-xs " + (confirmed ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
          {confirmed
            ? <p><strong>Confirmed annexure {config!.annexureId}</strong> · {dateLabel(config!.confirmedAt)}{config!.reference ? " · " + config!.reference : ""}</p>
            : <p><strong>Not confirmed.</strong> Production HS/UOM compatibility remains hard-blocked.</p>}
        </div>

        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Enter this ID only after FBR, PRAL, or your licensed integrator explicitly confirms the sales-annexure value for your integration. The value <strong>3</strong> shown in FBR technical documentation is an API example, not a MunshiOS default.</p>
        </div>

        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Confirmed sales-annexure ID</span>
            <Input name="annexureId" type="number" min="1" step="1" defaultValue={config?.annexureId ?? ""} placeholder="Only after external confirmation" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Confirmation reference</span>
            <Input name="reference" defaultValue={config?.reference ?? ""} placeholder="PRAL ticket / integrator email / FBR reference" maxLength={160} />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4 sm:col-span-2">
            <input name="confirmed" value="yes" type="checkbox" className="mt-0.5 size-4 accent-emerald-600" />
            <span className="text-xs leading-5 text-neutral-700">I confirm this annexure ID came from an authoritative FBR/PRAL/licensed-integrator source and is not copied from the documentation sample.</span>
          </label>

          <div className="min-h-5 text-sm sm:col-span-2">
            {state.status === "success" && <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="size-4" />{state.message}</span>}
            {state.status === "error" && <span role="alert" className="text-red-600">{state.message}</span>}
          </div>
          <div className="sm:col-span-2 sm:flex sm:justify-end">
            <Button type="submit" disabled={pending}>{pending ? "Confirming..." : "Save confirmed annexure"}</Button>
          </div>
        </form>
      </div>
    </section>
  );
}
