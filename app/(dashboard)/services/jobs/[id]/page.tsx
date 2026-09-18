import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, FileCheck2, UserRound, Wrench } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { getServiceJobDetail } from "@/lib/server/industry-modules";

export default async function ServiceJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId } = await requireWorkspace();
  const job = await getServiceJobDetail(workspaceId, id);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="space-y-3">
        <Link href="/services" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Services</Link>
        <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{job.jobNumber}</h1><span className="rounded-full border px-2.5 py-1 text-xs font-semibold">{job.status}</span></div><p className="mt-1 text-sm text-muted-foreground">{job.title}</p></div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Status" value={job.status.replaceAll("_"," ")} detail="Current service workflow state" icon={Wrench} />
        <MetricCard label="Scheduled" value={job.scheduledAt ? formatDateTime(job.scheduledAt) : "Not scheduled"} detail="Planned service date" icon={CalendarClock} />
        <MetricCard label="Completed" value={job.completedAt ? formatDateTime(job.completedAt) : "Not completed"} detail="Completion timestamp" icon={CalendarClock} />
        <MetricCard label="Quotation" value={job.quoteNumber || "Direct job"} detail={job.serviceQuoteId ? "Converted from accepted quotation" : "Created without quotation"} icon={FileCheck2} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-md border shadow-none ring-0"><CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2"><UserRound className="size-4 text-emerald-700" /><h2 className="text-sm font-semibold">Client</h2></div>
          <Detail label="Name" value={job.customerName || "Unknown client"} />
          {job.customerPhone ? <Detail label="Phone" value={job.customerPhone} /> : null}
          {job.customerEmail ? <Detail label="Email" value={job.customerEmail} /> : null}
          {job.customerAddress || job.customerCity ? <Detail label="Address" value={[job.customerAddress,job.customerCity].filter(Boolean).join(", ")} /> : null}
        </CardContent></Card>

        <Card className="rounded-md border shadow-none ring-0"><CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2"><Wrench className="size-4 text-emerald-700" /><h2 className="text-sm font-semibold">Job details</h2></div>
          {job.assignedToName ? <Detail label="Assigned to" value={job.assignedToName} /> : null}
          <Detail label="Created" value={formatDateTime(job.createdAt)} />
          <Detail label="Last updated" value={formatDateTime(job.updatedAt)} />
          {job.serviceQuoteId ? <Link href={"/services/quotes/"+job.serviceQuoteId} className="inline-flex text-sm font-semibold text-emerald-700 hover:underline">Open source quotation</Link> : null}
        </CardContent></Card>
      </div>

      {job.description ? <Card className="rounded-md border shadow-none ring-0"><CardContent className="p-5"><p className="text-sm font-semibold">Work description</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{job.description}</p></CardContent></Card> : null}
    </div>
  );
}
function Detail({label,value}:{label:string;value:string}){ return <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>; }
function formatDateTime(value:Date){ return new Intl.DateTimeFormat("en-PK",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Karachi"}).format(value); }
