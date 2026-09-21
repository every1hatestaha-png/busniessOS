"use client";

import { useActionState } from "react";
import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";

import {
  confirmFbrProductionRouteAction,
  type FbrProductionRouteState,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: FbrProductionRouteState = {};

export function FbrProductionRouteForm({
  config,
  canConfirm,
}: {
  config: {
    provider: string;
    integratorName: string | null;
    integratorLicenseNo: string | null;
    softwareRegistrationNo: string | null;
    productionApprovedAt: string | null;
    productionApprovedBy: string | null;
    productionApprovalReference: string | null;
  } | null;
  canConfirm: boolean;
}) {
  const [state, formAction, pending] = useActionState(confirmFbrProductionRouteAction, initialState);
  const confirmed = Boolean(
    config?.integratorName
    && config.softwareRegistrationNo
    && config.productionApprovedAt
    && config.productionApprovedBy
    && config.productionApprovalReference
    && (config.provider === "PRAL" || config.integratorLicenseNo),
  );

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b bg-slate-50/70 px-5 py-4">
        <div className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-800">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-950">FBR production integration evidence</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Record the verified PRAL or licensed-integrator route and software registration evidence. This does not enable live production transmission.
          </p>
        </div>
      </div>

      <form action={formAction} className="space-y-5 p-5">
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          <span>Never paste bearer tokens or FBR credentials here. Live transmission remains controlled by server-side secrets and the deployment kill switch.</span>
        </div>

        {confirmed && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
            <p className="font-semibold">Production route evidence recorded</p>
            <p className="mt-1">
              {config?.integratorName} · {config?.productionApprovalReference}
            </p>
            <p className="mt-1">Confirmed {config?.productionApprovedAt ? new Date(config.productionApprovedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : ""}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Integration route</span>
            <select
              name="provider"
              defaultValue={config?.provider && config.provider !== "PRAL" ? "LICENSED_INTEGRATOR" : "PRAL"}
              disabled={!canConfirm}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="PRAL">PRAL</option>
              <option value="LICENSED_INTEGRATOR">FBR licensed integrator</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Integrator name</span>
            <Input
              name="integratorName"
              defaultValue={config?.integratorName ?? (!config || config.provider === "PRAL" ? "PRAL" : "")}
              placeholder="PRAL or licensed integrator"
              maxLength={120}
              disabled={!canConfirm}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Integrator licence or FBR reference</span>
            <Input
              name="integratorLicenseNo"
              defaultValue={config?.integratorLicenseNo ?? ""}
              placeholder="Required for non-PRAL routes"
              maxLength={120}
              disabled={!canConfirm}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Software registration number</span>
            <Input
              name="softwareRegistrationNo"
              defaultValue={config?.softwareRegistrationNo ?? ""}
              placeholder="FBR-verifiable software registration number"
              maxLength={120}
              disabled={!canConfirm}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Onboarding or approval evidence reference</span>
          <Input
            name="reference"
            defaultValue={config?.productionApprovalReference ?? ""}
            placeholder="PRAL/FBR ticket, approval, onboarding or integrator reference"
            maxLength={200}
            disabled={!canConfirm}
          />
          <span className="mt-1 block text-[11px] text-slate-500">Use a traceable non-secret reference that can be checked during release review.</span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4">
          <input
            name="confirmed"
            value="yes"
            type="checkbox"
            disabled={!canConfirm}
            className="mt-0.5 size-4 accent-emerald-600"
          />
          <span className="text-xs leading-5 text-neutral-600">
            I confirm that this production route, software registration number, and evidence reference were obtained from the applicable FBR, PRAL, or licensed-integrator process.
          </span>
        </label>

        {!canConfirm && (
          <p className="text-xs text-neutral-500">Only the workspace owner can confirm or replace production integration evidence.</p>
        )}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm">
            {state.status === "success" && (
              <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="size-4" />{state.message}</span>
            )}
            {state.status === "error" && <span className="text-red-600" role="alert">{state.message}</span>}
          </div>
          <Button type="submit" disabled={pending || !canConfirm}>{pending ? "Saving..." : "Confirm production evidence"}</Button>
        </div>
      </form>
    </section>
  );
}
