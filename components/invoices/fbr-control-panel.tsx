"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Send, ShieldCheck } from "lucide-react";

import {
  prepareFbrInvoiceAction,
  submitFbrSandboxAction,
  type FbrInvoiceActionState,
  validateFbrSandboxAction,
} from "@/app/(dashboard)/invoices/fbr-actions";
import { Button } from "@/components/ui/button";

type FbrPanelProps = {
  invoiceId: string;
  environment: "SANDBOX" | "PRODUCTION";
  integrationEnabled: boolean;
  readyForRemoteValidation: boolean;
  preflightError: string | null;
  issues: Array<{ path: string; code: string; message: string }>;
  submission: null | {
    id: string;
    status: string;
    fbrInvoiceNumber: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    attemptCount: number;
    validatedAt: string | null;
    submittedAt: string | null;
    lastAttemptAt: string | null;
    attempts: Array<{
      id: string;
      kind: string;
      succeeded: boolean;
      httpStatus: number | null;
      errorCode: string | null;
      errorMessage: string | null;
      createdAt: string;
    }>;
  };
};

const initialState: FbrInvoiceActionState = {};

function statusLabel(status: string | undefined) {
  if (!status) return "Not prepared";
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (value) => value.toUpperCase());
}

function statusClass(status: string | undefined) {
  if (status === "SUBMITTED" || status === "VALIDATED") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "BLOCKED" || status === "FAILED" || status === "VALIDATION_FAILED") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "VALIDATING" || status === "SUBMITTING") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

function formatTimestamp(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function FbrControlPanel(props: FbrPanelProps) {
  const [prepareState, prepareAction, preparing] = useActionState(
    prepareFbrInvoiceAction.bind(null, props.invoiceId),
    initialState,
  );
  const [validateState, validateAction, validating] = useActionState(
    validateFbrSandboxAction.bind(null, props.invoiceId),
    initialState,
  );
  const [submitState, submitAction, submitting] = useActionState(
    submitFbrSandboxAction.bind(null, props.invoiceId),
    initialState,
  );

  const currentState = submitState.message ? submitState : validateState.message ? validateState : prepareState;
  const remoteBusy = validating || submitting;
  const isSandbox = props.environment === "SANDBOX";
  const isSubmitted = props.submission?.status === "SUBMITTED";
  const canValidate = isSandbox && props.integrationEnabled && props.readyForRemoteValidation && !isSubmitted;
  const canSubmit = isSandbox && props.submission?.status === "VALIDATED";

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="border-b bg-slate-50/70 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><ShieldCheck className="size-5" /></div>
            <div>
              <h2 className="font-semibold">FBR Digital Invoicing</h2>
              <p className="mt-0.5 text-xs leading-5 text-neutral-500">Controlled fiscal validation and submission for this invoice.</p>
            </div>
          </div>
          <span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 " + statusClass(props.submission?.status)}>
            {statusLabel(props.submission?.status)}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-neutral-50 p-3"><p className="text-neutral-500">Environment</p><p className="mt-1 font-semibold">{props.environment}</p></div>
          <div className="rounded-lg bg-neutral-50 p-3"><p className="text-neutral-500">Attempts</p><p className="mt-1 font-semibold">{props.submission?.attemptCount ?? 0}</p></div>
          <div className="rounded-lg bg-neutral-50 p-3"><p className="text-neutral-500">Validated</p><p className="mt-1 font-medium">{formatTimestamp(props.submission?.validatedAt ?? null)}</p></div>
          <div className="rounded-lg bg-neutral-50 p-3"><p className="text-neutral-500">Last attempt</p><p className="mt-1 font-medium">{formatTimestamp(props.submission?.lastAttemptAt ?? null)}</p></div>
        </div>

        {!props.integrationEnabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            FBR Digital Invoicing is disabled. <Link href="/settings" className="font-semibold underline">Open settings</Link> to configure sandbox mode.
          </div>
        )}

        {!isSandbox && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Production remote actions are locked in this invoice UI. Live transmission stays disabled until the production compliance checklist, per-item tax mapping, licensed integration route, and deployment switch are explicitly cleared.</span>
          </div>
        )}

        {props.preflightError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{props.preflightError}</div>
        )}

        {props.issues.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-neutral-700">Preflight blockers</p>
            <div className="space-y-2">
              {props.issues.slice(0, 6).map((issue, index) => (
                <div key={issue.code + issue.path + index} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">{issue.message}</p>
                  <p className="mt-1 text-[10px] text-amber-700">{issue.code} · {issue.path}</p>
                </div>
              ))}
              {props.issues.length > 6 && <p className="text-[11px] text-neutral-500">Plus {props.issues.length - 6} more blocker(s).</p>}
            </div>
          </div>
        )}

        {props.submission?.lastErrorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-semibold text-red-800">{props.submission.lastErrorMessage}</p>
            {props.submission.lastErrorCode && <p className="mt-1 text-[10px] text-red-600">{props.submission.lastErrorCode}</p>}
          </div>
        )}

        {props.submission?.fbrInvoiceNumber && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center gap-2 text-emerald-800"><CheckCircle2 className="size-4" /><p className="text-xs font-semibold">FBR invoice number</p></div>
            <p className="mt-1 break-all font-mono text-sm font-bold text-emerald-950">{props.submission.fbrInvoiceNumber}</p>
          </div>
        )}

        {currentState.message && (
          <p role={currentState.status === "error" ? "alert" : undefined} className={"rounded-lg border p-3 text-xs " + (currentState.status === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
            {currentState.message}
          </p>
        )}

        <div className="grid gap-2">
          <form action={prepareAction}>
            <Button type="submit" variant="outline" className="w-full justify-center" disabled={preparing || remoteBusy || isSubmitted}>
              <RefreshCw className={"size-4 " + (preparing ? "animate-spin" : "")} />
              {preparing ? "Checking preflight..." : "Prepare / refresh preflight"}
            </Button>
          </form>

          <form action={validateAction}>
            <Button type="submit" className="w-full justify-center" disabled={!canValidate || preparing || remoteBusy}>
              <ShieldCheck className="size-4" />
              {validating ? "Validating..." : "Validate with FBR sandbox"}
            </Button>
          </form>

          <form action={submitAction}>
            <Button type="submit" className="w-full justify-center" disabled={!canSubmit || preparing || remoteBusy}>
              <Send className="size-4" />
              {submitting ? "Submitting..." : "Post to FBR sandbox"}
            </Button>
          </form>
        </div>

        {props.submission?.attempts?.length ? (
          <div className="border-t pt-4">
            <div className="mb-2 flex items-center gap-2"><Clock3 className="size-4 text-neutral-400" /><p className="text-xs font-semibold text-neutral-700">Recent FBR attempts</p></div>
            <div className="space-y-2">
              {props.submission.attempts.slice(0, 5).map((attempt) => (
                <div key={attempt.id} className="flex items-start justify-between gap-3 rounded-lg bg-neutral-50 p-2.5 text-[11px]">
                  <div>
                    <p className="font-semibold">{attempt.kind} · {attempt.succeeded ? "Succeeded" : "Failed"}</p>
                    <p className="mt-0.5 text-neutral-500">{formatTimestamp(attempt.createdAt)}{attempt.httpStatus ? " · HTTP " + attempt.httpStatus : ""}</p>
                    {attempt.errorMessage && <p className="mt-1 text-red-600">{attempt.errorMessage}</p>}
                  </div>
                  {attempt.errorCode && <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-neutral-600">{attempt.errorCode}</span>}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
