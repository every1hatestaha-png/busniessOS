"use client";

import { useActionState } from "react";
import { CheckCircle2, KeyRound, LockKeyhole } from "lucide-react";

import {
  saveFbrWorkspaceCredentialAction,
  type FbrWorkspaceCredentialState,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: FbrWorkspaceCredentialState = {};

export function FbrWorkspaceCredentialForm({
  canManage,
  sandboxReady,
  productionReady,
}: {
  canManage: boolean;
  sandboxReady: boolean;
  productionReady: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveFbrWorkspaceCredentialAction, initialState);

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b bg-slate-50/70 px-5 py-4">
        <div className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
          <KeyRound className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-950">FBR workspace connection</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Verify and store this workspace&apos;s FBR credential. The secret is encrypted and is never displayed again.
          </p>
        </div>
      </div>

      <form action={formAction} className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusCard label="Sandbox credential" ready={sandboxReady} />
          <StatusCard label="Production credential" ready={productionReady} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Credential environment</span>
            <select
              name="environment"
              defaultValue="PRODUCTION"
              disabled={!canManage}
              className="h-9 w-full rounded-md border bg-white px-3 text-sm"
            >
              <option value="PRODUCTION">Production</option>
              <option value="SANDBOX">Sandbox</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">FBR bearer token</span>
            <Input
              name="token"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              minLength={12}
              maxLength={4096}
              placeholder="Paste credential"
              disabled={!canManage}
              required
            />
          </label>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked
            disabled={!canManage}
            className="mt-0.5 size-4 accent-emerald-600"
          />
          <span>
            <span className="block text-sm font-semibold text-neutral-900">Enable FBR for this workspace</span>
            <span className="mt-0.5 block text-xs leading-5 text-neutral-500">
              This selects the credential environment for invoice preparation. Production POST still requires all compliance checks and the deployment safety switch.
            </span>
          </span>
        </label>

        <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          <span>Saving a production credential does not by itself permit a production invoice transmission.</span>
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
          <Button type="submit" disabled={pending || !canManage}>
            {pending ? "Verifying..." : "Verify and save credential"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function StatusCard({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className={"rounded-xl border p-4 " + (ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
      <p className="text-xs font-semibold">{label}</p>
      <p className="mt-1 text-xs leading-5">{ready ? "Verified credential stored." : "No verified workspace credential stored."}</p>
    </div>
  );
}
