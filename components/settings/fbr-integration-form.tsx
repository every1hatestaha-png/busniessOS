"use client";

import { useActionState } from "react";
import { CheckCircle2, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";

import {
  type FbrSandboxConfigState,
  updateFbrSandboxConfigAction,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: FbrSandboxConfigState = {};

export function FbrIntegrationForm({
  config,
  sandboxCredentialReady,
}: {
  config: {
    enabled: boolean;
    environment: "SANDBOX" | "PRODUCTION";
    defaultScenarioId: string | null;
    provider: string;
    integratorName: string | null;
    integratorLicenseNo: string | null;
  } | null;
  sandboxCredentialReady: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateFbrSandboxConfigAction, initialState);
  const production = config?.environment === "PRODUCTION";

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b bg-slate-50/70 px-5 py-4">
        <div className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-950">FBR Digital Invoicing</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Configure the sandbox test scenario. Workspace connection and credentials are controlled separately above.
          </p>
        </div>
      </div>

      <form action={formAction} className="space-y-5 p-5">
        {production && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <LockKeyhole className="mt-0.5 size-4 shrink-0" />
            <span>Production configuration is locked here. Use the controlled production release process instead of this sandbox form.</span>
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs leading-5 text-neutral-600">
          Enable or disable FBR only from the workspace connection panel above. This sandbox section configures the assigned test scenario only.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Environment</span>
            <Input value={production ? "PRODUCTION (locked)" : "SANDBOX"} readOnly aria-readonly="true" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Default sandbox scenario</span>
            <Input
              name="defaultScenarioId"
              defaultValue={config?.defaultScenarioId ?? ""}
              placeholder="SN001"
              maxLength={12}
              disabled={production}
            />
            <span className="mt-1 block text-[11px] text-slate-500">Use the FBR scenario assigned to the sandbox test case.</span>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className={"rounded-xl border p-4 " + (sandboxCredentialReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
            <div className="flex items-center gap-2"><KeyRound className="size-4" /><p className="text-xs font-semibold">Sandbox credential</p></div>
            <p className="mt-1 text-xs leading-5">
              {sandboxCredentialReady ? "Server-side sandbox token is configured." : "No usable server-side sandbox token is configured yet."}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2"><LockKeyhole className="size-4" /><p className="text-xs font-semibold">Production safety</p></div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Live transmission remains locked by production compliance checks and the deployment-level kill switch.
            </p>
          </div>
        </div>

        {(config?.integratorName || config?.integratorLicenseNo) && (
          <div className="rounded-xl bg-neutral-50 p-4 text-xs text-neutral-600">
            <p className="font-semibold text-neutral-800">Recorded integration route</p>
            <p className="mt-1">
              Provider: {config.provider}
              {config.integratorName ? " · " + config.integratorName : ""}
              {config.integratorLicenseNo ? " · Ref " + config.integratorLicenseNo : ""}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm">
            {state.status === "success" && (
              <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="size-4" />{state.message}</span>
            )}
            {state.status === "error" && <span className="text-red-600" role="alert">{state.message}</span>}
          </div>
          <Button type="submit" disabled={pending || production}>{pending ? "Saving..." : "Save sandbox setup"}</Button>
        </div>
      </form>
    </section>
  );
}
