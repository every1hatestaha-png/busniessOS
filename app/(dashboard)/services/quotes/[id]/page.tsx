import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, CalendarDays, Printer, ReceiptText, UserRound } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { getServiceQuoteDetail } from "@/lib/server/industry-modules";
import { formatPKR } from "@/lib/utils";

export default async function ServiceQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requireWorkspace();
  const quote = await getServiceQuoteDetail(workspaceId, id);
  if (!quote) notFound();

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="space-y-3">
        <Link href="/services" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />Services
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{quote.quoteNumber}</h1>
              <StatusBadge status={quote.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{quote.customerName || "Unknown client"}</p>
          </div>
          <Link href={"/services/quotes/" + quote.id + "/print"} className={buttonVariants({ variant: "outline" })}><Printer />Print quotation</Link>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total" value={formatPKR(quote.total)} detail={"Subtotal " + formatPKR(quote.subtotal)} icon={ReceiptText} />
        <MetricCard label="Discount" value={formatPKR(quote.discount)} detail="Applied to this quotation" icon={ReceiptText} />
        <MetricCard label="Tax" value={formatPKR(quote.tax)} detail="Tax included in total" icon={ReceiptText} />
        <MetricCard label="Valid until" value={quote.validUntil ? formatDate(quote.validUntil) : "No expiry"} detail={"Created " + formatDate(quote.createdAt)} icon={CalendarDays} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.75fr)]">
        <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
          <CardContent className="p-0">
            <div className="border-b px-4 py-3"><p className="text-sm font-semibold">Quotation lines</p><p className="text-xs text-muted-foreground">Commercial breakdown for this service quotation.</p></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr><th className="px-4 py-2.5">Description</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">Rate</th><th className="px-4 py-2.5 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y">
                  {quote.items.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.description}</td><td className="px-4 py-3 text-right text-muted-foreground">{formatQty(item.quantity)}</td><td className="px-4 py-3 text-right text-muted-foreground">{formatPKR(item.unitPrice)}</td><td className="px-4 py-3 text-right font-medium">{formatPKR(item.lineTotal)}</td></tr>)}
                </tbody>
                <tfoot className="border-t bg-muted/20">
                  <tr><td colSpan={3} className="px-4 py-2.5 text-right text-xs text-muted-foreground">Subtotal</td><td className="px-4 py-2.5 text-right">{formatPKR(quote.subtotal)}</td></tr>
                  {quote.discount > 0 ? <tr><td colSpan={3} className="px-4 py-2.5 text-right text-xs text-muted-foreground">Discount</td><td className="px-4 py-2.5 text-right">- {formatPKR(quote.discount)}</td></tr> : null}
                  {quote.tax > 0 ? <tr><td colSpan={3} className="px-4 py-2.5 text-right text-xs text-muted-foreground">Tax</td><td className="px-4 py-2.5 text-right">{formatPKR(quote.tax)}</td></tr> : null}
                  <tr className="border-t"><td colSpan={3} className="px-4 py-3 text-right font-semibold">Total</td><td className="px-4 py-3 text-right font-semibold">{formatPKR(quote.total)}</td></tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="rounded-md border shadow-none ring-0"><CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2"><UserRound className="size-4 text-emerald-700" /><h2 className="text-sm font-semibold">Client</h2></div>
            <Detail label="Name" value={quote.customerName || "Unknown client"} />
            {quote.customerPhone ? <Detail label="Phone" value={quote.customerPhone} /> : null}
            {quote.customerEmail ? <Detail label="Email" value={quote.customerEmail} /> : null}
            {quote.customerAddress || quote.customerCity ? <Detail label="Address" value={[quote.customerAddress, quote.customerCity].filter(Boolean).join(", ")} /> : null}
          </CardContent></Card>

          <Card className="rounded-md border shadow-none ring-0"><CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2"><BriefcaseBusiness className="size-4 text-emerald-700" /><h2 className="text-sm font-semibold">Converted jobs</h2></div>
            {quote.jobs.length ? quote.jobs.map((job) => <Link key={job.id} href={"/services/jobs/" + job.id} className="block rounded-lg border p-3 transition hover:bg-muted/40"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{job.jobNumber}</p><p className="text-xs text-muted-foreground">{job.title}</p></div><span className="rounded-full border px-2 py-0.5 text-[11px]">{job.status}</span></div></Link>) : <p className="text-sm text-muted-foreground">No service job linked to this quotation.</p>}
          </CardContent></Card>

          {quote.notes ? <Card className="rounded-md border shadow-none ring-0"><CardContent className="p-5"><p className="text-sm font-semibold">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{quote.notes}</p></CardContent></Card> : null}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>; }
function StatusBadge({ status }: { status: string }) { return <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">{status}</span>; }
function formatDate(value: Date) { return new Intl.DateTimeFormat("en-PK",{dateStyle:"medium",timeZone:"Asia/Karachi"}).format(value); }
function formatQty(value:number){ return new Intl.NumberFormat("en-PK",{maximumFractionDigits:4}).format(value); }
