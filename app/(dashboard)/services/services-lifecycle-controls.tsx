"use client";

import { useActionState } from "react";
import { CheckCircle2, CircleX, Clock3, Send, Wrench } from "lucide-react";

import {
  initialServicesActionState,
  updateServiceJobStatusAction,
  updateServiceQuoteStatusAction,
} from "@/app/(dashboard)/services/actions";
import { Button } from "@/components/ui/button";

type Quote = { id: string; quoteNumber: string; status: string; customerName: string | null };
type Job = { id: string; jobNumber: string; title: string; status: string; customerName: string | null };

export function ServicesLifecycleControls({ quotes, jobs }: { quotes: Quote[]; jobs: Job[] }) {
  const quoteActions = quotes.filter((quote) => !["REJECTED", "EXPIRED", "CONVERTED"].includes(quote.status));
  const jobActions = jobs.filter((job) => !["COMPLETED", "CANCELLED"].includes(job.status));
  if (!quoteActions.length && !jobActions.length) return null;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="rounded-md border">
        <div className="border-b px-4 py-3"><p className="text-sm font-semibold">Quotation workflow</p><p className="text-xs text-muted-foreground">Move quotations forward without reopening terminal states.</p></div>
        {quoteActions.length ? <div className="divide-y">{quoteActions.map((quote) => <QuoteRow key={quote.id} quote={quote} />)}</div> : <div className="p-4 text-sm text-muted-foreground">No active quotations.</div>}
      </div>
      <div className="rounded-md border">
        <div className="border-b px-4 py-3"><p className="text-sm font-semibold">Job workflow</p><p className="text-xs text-muted-foreground">Track work in progress, waiting clients, completion, and cancellation.</p></div>
        {jobActions.length ? <div className="divide-y">{jobActions.map((job) => <JobRow key={job.id} job={job} />)}</div> : <div className="p-4 text-sm text-muted-foreground">No active service jobs.</div>}
      </div>
    </div>
  );
}

function QuoteRow({ quote }: { quote: Quote }) {
  const [state, action, pending] = useActionState(updateServiceQuoteStatusAction, initialServicesActionState);
  const statuses = quote.status === "DRAFT" ? ["SENT", "ACCEPTED", "REJECTED", "EXPIRED"] : quote.status === "SENT" ? ["ACCEPTED", "REJECTED", "EXPIRED"] : [];
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><span className="font-medium">{quote.quoteNumber}</span><span className="rounded-full border px-2 py-0.5 text-[11px]">{quote.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{quote.customerName || "Unknown client"}</p></div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((status) => <form action={action} key={status}><input type="hidden" name="quoteId" value={quote.id} /><input type="hidden" name="status" value={status} /><Button type="submit" size="sm" variant={status === "REJECTED" || status === "EXPIRED" ? "outline" : "default"} disabled={pending}>{status === "SENT" ? <Send /> : status === "ACCEPTED" ? <CheckCircle2 /> : <CircleX />}{status.replaceAll("_", " ")}</Button></form>)}
        </div>
      </div>
      <ActionMessage state={state} />
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const [state, action, pending] = useActionState(updateServiceJobStatusAction, initialServicesActionState);
  const statuses = job.status === "OPEN"
    ? ["IN_PROGRESS", "WAITING_CUSTOMER", "COMPLETED", "CANCELLED"]
    : job.status === "IN_PROGRESS"
      ? ["WAITING_CUSTOMER", "COMPLETED", "CANCELLED"]
      : ["IN_PROGRESS", "COMPLETED", "CANCELLED"];
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><span className="font-medium">{job.jobNumber}</span><span className="rounded-full border px-2 py-0.5 text-[11px]">{job.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{job.title} · {job.customerName || "Unknown client"}</p></div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((status) => <form action={action} key={status}><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="status" value={status} /><Button type="submit" size="sm" variant={status === "CANCELLED" ? "outline" : "default"} disabled={pending}>{status === "IN_PROGRESS" ? <Wrench /> : status === "WAITING_CUSTOMER" ? <Clock3 /> : status === "COMPLETED" ? <CheckCircle2 /> : <CircleX />}{status.replaceAll("_", " ")}</Button></form>)}
        </div>
      </div>
      <ActionMessage state={state} />
    </div>
  );
}

function ActionMessage({ state }: { state: { status: "idle" | "success" | "error"; message: string } }) { if (!state.message) return null; return <p className={state.status === "error" ? "mt-2 text-xs text-destructive" : "mt-2 text-xs text-emerald-700"}>{state.message}</p>; }
