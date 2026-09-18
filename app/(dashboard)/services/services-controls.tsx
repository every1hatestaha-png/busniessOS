"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  createServiceJobAction,
  createServiceQuoteAction,
  initialServicesActionState,
} from "@/app/(dashboard)/services/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ClientOption = { id: string; name: string };
type QuoteOption = { id: string; customerId: string; quoteNumber: string; status: string };
type QuoteLine = { description: string; quantity: string; unitPrice: string };

export function ServicesControls({
  clients,
  quotes,
}: {
  clients: ClientOption[];
  quotes: QuoteOption[];
}) {
  const [quoteState, quoteAction, quotePending] = useActionState(createServiceQuoteAction, initialServicesActionState);
  const [jobState, jobAction, jobPending] = useActionState(createServiceJobAction, initialServicesActionState);
  const [lines, setLines] = useState<QuoteLine[]>([{ description: "", quantity: "1", unitPrice: "0" }]);
  const [jobCustomerId, setJobCustomerId] = useState("");

  const itemsJson = useMemo(
    () => JSON.stringify(lines.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
    }))),
    [lines],
  );

  const matchingQuotes = quotes.filter((quote) => !jobCustomerId || quote.customerId === jobCustomerId);

  function updateLine(index: number, patch: Partial<QuoteLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="rounded-md border shadow-none ring-0">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold">New quotation</h2>
          <p className="mt-1 text-xs text-muted-foreground">Create a multi-line client quotation with discount and tax.</p>
          <form action={quoteAction} className="mt-4 space-y-4">
            <input type="hidden" name="itemsJson" value={itemsJson} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client">
                <select name="customerId" required defaultValue="" className={selectClass}>
                  <option value="" disabled>Select client</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </Field>
              <Field label="Quote number"><Input name="quoteNumber" placeholder="QT-0001" maxLength={80} required /></Field>
              <Field label="Valid until"><Input name="validUntil" type="date" /></Field>
              <Field label="Notes"><Input name="notes" placeholder="Optional notes" maxLength={1000} /></Field>
            </div>

            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2.5">
                <p className="text-xs font-semibold">Quotation lines</p>
                <Button type="button" variant="outline" size="sm" disabled={lines.length >= 100} onClick={() => setLines((current) => [...current, { description: "", quantity: "1", unitPrice: "0" }])}><Plus />Add line</Button>
              </div>
              <div className="divide-y">
                {lines.map((line, index) => (
                  <div key={index} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_110px_140px_36px]">
                    <Input aria-label="Line description" placeholder="Service description" maxLength={250} value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} required />
                    <Input aria-label="Quantity" type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} required />
                    <Input aria-label="Unit price" type="number" min={0} step="0.01" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} required />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Discount"><Input name="discount" type="number" min={0} step="0.01" defaultValue={0} /></Field>
              <Field label="Tax"><Input name="tax" type="number" min={0} step="0.01" defaultValue={0} /></Field>
            </div>
            <div className="flex items-center justify-between gap-3"><ActionMessage state={quoteState} /><Button type="submit" disabled={quotePending || clients.length === 0}>{quotePending ? "Creating..." : "Create quotation"}</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-md border shadow-none ring-0">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold">New service job</h2>
          <p className="mt-1 text-xs text-muted-foreground">Start a client job directly or convert one of that client&apos;s quotations.</p>
          <form action={jobAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Client">
              <select name="customerId" required value={jobCustomerId} onChange={(event) => setJobCustomerId(event.target.value)} className={selectClass}>
                <option value="" disabled>Select client</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </Field>
            <Field label="Quotation (optional)">
              <select name="serviceQuoteId" defaultValue="" className={selectClass}>
                <option value="">No quotation</option>
                {matchingQuotes.filter((quote) => quote.status === "ACCEPTED").map((quote) => <option key={quote.id} value={quote.id}>{quote.quoteNumber} · ACCEPTED</option>)}
              </select>
            </Field>
            <Field label="Job number"><Input name="jobNumber" placeholder="JOB-0001" maxLength={80} required /></Field>
            <Field label="Title"><Input name="title" placeholder="Installation / Repair" maxLength={160} required /></Field>
            <Field label="Scheduled at"><Input name="scheduledAt" type="datetime-local" /></Field>
            <Field label="Description"><Input name="description" placeholder="Optional job details" maxLength={1000} /></Field>
            <div className="sm:col-span-2 flex items-center justify-between gap-3"><ActionMessage state={jobState} /><Button type="submit" disabled={jobPending || clients.length === 0}>{jobPending ? "Creating..." : "Create job"}</Button></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const selectClass = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5 text-xs font-medium"><span>{label}</span>{children}</label>;
}

function ActionMessage({ state }: { state: { status: "idle" | "success" | "error"; message: string } }) {
  if (!state.message) return <span />;
  return <p className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-emerald-700"}>{state.message}</p>;
}
