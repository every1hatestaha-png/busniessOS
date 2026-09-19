"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, FileCheck2, Send, ShieldAlert } from "lucide-react";

import {
  prepareFbrInvoiceAction,
  submitFbrInvoiceAction,
  validateFbrInvoiceAction,
} from "@/app/(dashboard)/invoices/[id]/fbr-actions";
import { Button } from "@/components/ui/button";

type FbrIssue = {
  path: string;
  code: string;
  message: string;
};

type Submission = {
  id: string;
  environment: "SANDBOX" | "PRODUCTION";
  status: "DRAFT" | "VALIDATING" | "VALIDATION_FAILED" | "VALIDATED" | "SUBMITTING" | "SUBMITTED" | "FAILED" | "BLOCKED";
  fbrInvoiceNumber: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  attemptCount: number;
};

function statusTone(status: Submission["status"]) {
  if (status === "SUBMITTED" || status === "VALIDATED") return "bg-emerald-100 text-emerald-800";
  if (status === "BLOCKED" || status === "FAILED" || status === "VALIDATION_FAILED") return "bg-red-100 text-red-800";
  if (status === "VALIDATING" || status === "SUBMITTING") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

export function FbrInvoicePanel({
  invoiceId,
  submission,
  issues,
}: {
  invoiceId: string;
  submission: Submission | null;
  issues: FbrIssue[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const ambiguous = submission?.lastErrorCode === "AMBIGUOUS_POST_RESULT";

  function run(task: () => Promise<{ ok: boolean; message: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await task();
      setFeedback(result);
      router.refresh();
    });
  }

  function submit() {
    if (!submission) return;
    const confirmed = window.confirm(
      "Submit this validated fiscal invoice to FBR? This external submission can be irreversible and must not be duplicated.",
    );
    if (!confirmed) return;
    run(() => submitFbrInvoiceAction(invoiceId, submission.id));
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-emerald-700" />
            <h2 className="font-semibold">FBR Digital Invoicing</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            Fiscal submission is separate from MunshiOS accounting. Preparation and validation never repost stock or ledger entries.
          </p>
        </div>
        {submission && (
          <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + statusTone(submission.status)}>
            {submission.environment} · {submission.status.replaceAll("_", " ")}
          </span>
        )}
      </div>

      {!submission ? (
        <div className="mt-4 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">No FBR submission prepared yet.</p>
          <p className="mt-1 text-xs text-neutral-500">
            MunshiOS will first build an immutable payload snapshot and run local preflight checks.
          </p>
          <Button className="mt-3" size="sm" disabled={pending} onClick={() => run(() => prepareFbrInvoiceAction(invoiceId))}>
            Prepare FBR invoice
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {submission.fbrInvoiceNumber && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">FBR invoice number</p>
              <p className="mt-1 font-mono text-sm font-bold text-emerald-950">{submission.fbrInvoiceNumber}</p>
            </div>
          )}

          {issues.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <CircleAlert className="h-4 w-4" />
                Preflight issues
              </div>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-900">
                {issues.map((issue, index) => (
                  <li key={issue.path + issue.code + index}>
                    <span className="font-mono">{issue.path}</span> — {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ambiguous && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4" />
                Reconciliation required
              </div>
              <p className="mt-1 text-xs leading-5">
                The last POST outcome is uncertain. MunshiOS has disabled blind retries to avoid creating a duplicate fiscal invoice.
              </p>
            </div>
          )}

          {submission.lastErrorMessage && !ambiguous && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
              <strong>{submission.lastErrorCode ?? "FBR error"}:</strong> {submission.lastErrorMessage}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {submission.status !== "SUBMITTED" && !ambiguous && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => prepareFbrInvoiceAction(invoiceId))}>
                Refresh preflight
              </Button>
            )}

            {["DRAFT", "VALIDATION_FAILED", "FAILED", "BLOCKED"].includes(submission.status) && !ambiguous && issues.length === 0 && (
              <Button size="sm" disabled={pending} onClick={() => run(() => validateFbrInvoiceAction(invoiceId, submission.id))}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Validate with FBR
              </Button>
            )}

            {submission.status === "VALIDATED" && (
              <Button size="sm" disabled={pending} onClick={submit}>
                <Send className="mr-1.5 h-4 w-4" />
                Submit to FBR
              </Button>
            )}
          </div>

          <p className="text-[11px] text-neutral-500">
            Remote attempts recorded: {submission.attemptCount}. Automatic fiscal submission is intentionally disabled.
          </p>
        </div>
      )}

      {feedback && (
        <div className={"mt-4 rounded-lg border p-3 text-xs " + (feedback.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {feedback.message}
        </div>
      )}
    </section>
  );
}
