"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";

import {
  prepareFbrSandboxAction,
  validateFbrSandboxAction,
  type FbrInvoiceActionState,
} from "@/app/(dashboard)/invoices/actions";
import { StatusBadge } from "@/components/business/status-badge";
import { Button } from "@/components/ui/button";

export type FbrInvoicePanelData = {
  environment: "SANDBOX" | "PRODUCTION" | null;
  readyForRemoteValidation: boolean;
  payloadStale: boolean;
  unavailableMessage: string | null;
  issues: Array<{ path: string; code: string; message: string }>;
  submission: null | {
    id: string;
    status: string;
    fbrInvoiceNumber: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    attemptCount: number;
    validatedAtLabel: string | null;
    submittedAtLabel: string | null;
    lastAttemptAtLabel: string | null;
    attempts: Array<{
      id: string;
      kind: string;
      succeeded: boolean;
      httpStatus: number | null;
      errorCode: string | null;
      createdAtLabel: string;
    }>;
  };
};

const initialState: FbrInvoiceActionState = {};

export function FbrInvoiceStatusCard({
  invoiceId,
  data,
}: {
  invoiceId: string;
  data: FbrInvoicePanelData;
}) {
  const prepare = prepareFbrSandboxAction.bind(null, invoiceId);
  const validate = validateFbrSandboxAction.bind(null, invoiceId, data.submission?.id ?? "");
  const [prepareState, prepareAction, preparePending] = useActionState(prepare, initialState);
  const [validateState, validateAction, validatePending] = useActionState(validate, initialState);

  const status = data.submission?.status ?? "NOT PREPARED";
  const sandbox = data.environment === "SANDBOX";
  const production = data.environment === "PRODUCTION";
  const busy = preparePending || validatePending;
  const canPrepare = sandbox
    && !["VALIDATING", "SUBMITTING", "SUBMITTED"].includes(data.submission?.status ?? "");
  const canValidate = sandbox
    && Boolean(data.submission)
    && data.readyForRemoteValidation
    && !data.payloadStale
    && ["DRAFT", "VALIDATION_FAILED", "FAILED", "BLOCKED"].includes(data.submission?.status ?? "");

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">FBR Digital Invoicing</h2>
            <p className="mt-0.5 text-xs text-neutral-500">Invoice compliance and sandbox validation.</p>
          </div>
        </div>
        {data.environment && (
          <span className={`rounded-full border px-2 py-1 text-[10px] font-bold tracking-wide ${sandbox ? "border-sky-200 bg-sky-50 text-sky-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {data.environment}
          </span>
        )}
      </div>

      {production && (
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Production network actions are locked. Per-item FBR sale type and rate mapping, licensed integration validation, and release approval must be complete first.</p>
        </div>
      )}

      {data.unavailableMessage && (
        <div className="mt-4 flex gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{data.unavailableMessage}</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">FBR status</p>
          <div className="mt-1">{data.submission ? <StatusBadge status={data.submission.status} /> : <span className="font-medium text-neutral-700">Not prepared</span>}</div>
        </div>
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">Attempts</p>
          <p className="mt-1 font-semibold tabular-nums">{data.submission?.attemptCount ?? 0}</p>
        </div>
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">Validated</p>
          <p className="mt-1 text-xs font-medium text-neutral-800">{data.submission?.validatedAtLabel ?? "Not yet"}</p>
        </div>
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">FBR invoice no.</p>
          <p className="mt-1 break-all font-mono text-xs font-semibold">{data.submission?.fbrInvoiceNumber ?? "Not issued"}</p>
        </div>
      </div>

      {data.payloadStale && (
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
          <p>The invoice or FBR master data changed after this payload was prepared. Prepare a fresh sandbox payload before validation.</p>
        </div>
      )}

      {data.issues.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Preflight blockers</p>
          <div className="mt-2 space-y-2">
            {data.issues.slice(0, 6).map((issue, index) => (
              <div key={`${issue.code}-${issue.path}-${index}`} className="rounded-lg border border-red-100 bg-red-50 p-2.5">
                <p className="text-xs font-semibold text-red-800">{issue.code} · {issue.path}</p>
                <p className="mt-0.5 text-xs text-red-700">{issue.message}</p>
              </div>
            ))}
            {data.issues.length > 6 && <p className="text-xs text-neutral-500">Plus {data.issues.length - 6} more blocker(s).</p>}
          </div>
        </div>
      )}

      {data.submission?.lastErrorMessage && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-800">{data.submission.lastErrorCode ?? "FBR ERROR"}</p>
          <p className="mt-1 text-sm text-red-700">{data.submission.lastErrorMessage}</p>
        </div>
      )}

      {data.submission?.status === "VALIDATED" && sandbox && !data.payloadStale && (
        <div className="mt-4 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Sandbox validation passed. Production submission is not exposed from this screen.</p>
        </div>
      )}

      {data.submission?.attempts.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent FBR attempts</p>
          <div className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {data.submission.attempts.map((attempt) => (
              <div key={attempt.id} className="flex items-center justify-between gap-3 p-2.5 text-xs">
                <div>
                  <p className="font-semibold">{attempt.kind} · {attempt.succeeded ? "Succeeded" : "Failed"}</p>
                  <p className="mt-0.5 text-neutral-500">{attempt.createdAtLabel}{attempt.errorCode ? ` · ${attempt.errorCode}` : ""}</p>
                </div>
                <span className="font-mono text-neutral-500">{attempt.httpStatus ?? "network"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(prepareState.error || validateState.error) && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {validateState.error ?? prepareState.error}
        </p>
      )}
      {(prepareState.success || validateState.success) && (
        <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {validateState.success ?? prepareState.success}
        </p>
      )}

      {sandbox && (
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={prepareAction}>
            <Button type="submit" variant="outline" disabled={!canPrepare || busy}>
              <RefreshCw className="h-4 w-4" />
              {preparePending ? "Preparing..." : data.submission ? "Refresh sandbox payload" : "Prepare sandbox payload"}
            </Button>
          </form>
          <form action={validateAction}>
            <Button type="submit" disabled={!canValidate || busy}>
              <FlaskConical className="h-4 w-4" />
              {validatePending ? "Validating..." : "Validate with FBR sandbox"}
            </Button>
          </form>
        </div>
      )}

      {sandbox && !data.readyForRemoteValidation && !data.unavailableMessage && (
        <p className="mt-3 text-xs text-neutral-500">Remote validation stays disabled until every preflight blocker is resolved.</p>
      )}
      {data.submission?.lastAttemptAtLabel && <p className="mt-3 text-[11px] text-neutral-400">Last FBR attempt: {data.submission.lastAttemptAtLabel}</p>}
      <span className="sr-only">{status}</span>
    </section>
  );
}
