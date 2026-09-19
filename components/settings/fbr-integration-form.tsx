"use client";

import { useActionState } from "react";
import { CheckCircle2, ShieldCheck, TriangleAlert } from "lucide-react";

import { updateFbrSettingsAction, type FbrSettingsState } from "@/app/(dashboard)/settings/fbr-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: FbrSettingsState = {};

export function FbrIntegrationForm({
  config,
  credential,
}: {
  config: {
    enabled: boolean;
    environment: "SANDBOX" | "PRODUCTION";
    provider: string;
    integratorName: string | null;
    defaultScenarioId: string | null;
  } | null;
  credential: {
    configured: boolean;
    source: "workspace" | "shared" | null;
  };
}) {
  const [state, formAction, pending] = useActionState(updateFbrSettingsAction, initialState);
  const credentialClassName = credential.configured
    ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
    : "inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800";

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b bg-slate-50/70 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-950">FBR Digital Invoicing</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Govern sandbox and production submission settings without storing bearer tokens in the database.
          </p>
        </div>
        <div className={credentialClassName}>
          {credential.configured ? <ShieldCheck className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
          {credential.configured ? "Credential ready" : "Credential missing"}
        </div>
      </div>

      <form action={formAction} className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Integration state">
            <select name="enabled" defaultValue={String(config?.enabled ?? false)} className="h-9 w-full rounded-md border bg-white px-3 text-sm">
              <option value="false">Disabled</option>
              <option value="true">Enabled</option>
            </select>
          </Field>

          <Field label="Environment">
            <select name="environment" defaultValue={config?.environment ?? "SANDBOX"} className="h-9 w-full rounded-md border bg-white px-3 text-sm">
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production</option>
            </select>
          </Field>

          <Field label="Provider">
            <Input name="provider" defaultValue={config?.provider ?? "PRAL"} maxLength={80} required />
          </Field>

          <Field label="Licensed integrator" hint="Optional display/reference metadata">
            <Input name="integratorName" defaultValue={config?.integratorName ?? ""} maxLength={120} placeholder="e.g. PRAL" />
          </Field>

          <Field label="Sandbox scenario ID" hint="Required while sandbox mode is enabled">
            <Input name="defaultScenarioId" defaultValue={config?.defaultScenarioId ?? ""} maxLength={40} placeholder="e.g. SN001" />
          </Field>

          <div className="rounded-xl border bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <p className="font-semibold text-slate-800">Credential isolation</p>
            <p className="mt-1">
              {credential.configured
                ? "A " + (credential.source === "workspace" ? "workspace-scoped" : "shared opt-in") + " credential is available server-side. Its value is never returned to this page."
                : "No usable server-side credential is configured. MunshiOS will refuse to enable remote FBR calls."}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm">
            {state.status === "success" && (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="size-4" />{state.message}
              </span>
            )}
            {state.status === "error" && <span className="text-red-600" role="alert">{state.message}</span>}
          </div>
          <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save FBR settings"}</Button>
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      {hint && <span className="-mt-0.5 mb-1.5 block text-[11px] text-slate-500">{hint}</span>}
      {children}
    </label>
  );
}
