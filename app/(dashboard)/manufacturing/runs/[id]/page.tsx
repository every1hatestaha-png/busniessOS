import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, CalendarClock, Factory, PackageCheck, ReceiptText } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { getProductionRunDetail } from "@/lib/server/industry-modules";
import { formatPKR } from "@/lib/utils";

export default async function ProductionRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { workspaceId } = await requireWorkspace();
  const run = await getProductionRunDetail(workspaceId, id);
  if (!run) notFound();

  const outputVariance = run.actualOutput === null ? null : run.actualOutput - run.plannedOutput;
  const unitCost = run.actualOutput && run.actualOutput > 0 ? run.materialCost / run.actualOutput : null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="space-y-3">
        <Link href="/manufacturing" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />Manufacturing
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{run.runNumber}</h1>
              <StatusBadge status={run.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {run.bom.name + " · v" + run.bom.version + " · " + run.bom.finishedProductName}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{"Created " + formatDateTime(run.createdAt)}</p>
            {run.approvedAt ? <p>{"Approved " + formatDateTime(run.approvedAt)}</p> : null}
            {run.postedAt ? <p>{"Posted " + formatDateTime(run.postedAt)}</p> : null}
          </div>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Planned output" value={formatQuantity(run.plannedOutput)} detail={"BOM yield " + formatQuantity(run.bom.outputQuantity)} icon={Factory} />
        <MetricCard label="Actual output" value={run.actualOutput === null ? "—" : formatQuantity(run.actualOutput)} detail={outputVariance === null ? "Not posted yet" : "Variance " + formatSignedQuantity(outputVariance)} icon={PackageCheck} />
        <MetricCard label="Material cost" value={formatPKR(run.materialCost)} detail={unitCost === null ? "Available after posting" : formatPKR(unitCost) + " per output unit"} icon={ReceiptText} />
        <MetricCard label="Recorded wastage" value={formatQuantity(run.wastageQuantity)} detail="Production run wastage quantity" icon={Boxes} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.75fr)]">
        <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">Material consumption</p>
              <p className="text-xs text-muted-foreground">Raw materials recorded when this production run was posted.</p>
            </div>
            {run.consumptions.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Material</th>
                      <th className="px-4 py-2.5 text-right">Planned</th>
                      <th className="px-4 py-2.5 text-right">Actual</th>
                      <th className="px-4 py-2.5 text-right">Unit cost</th>
                      <th className="px-4 py-2.5 text-right">Total cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {run.consumptions.map((line) => (
                      <tr key={line.productId}>
                        <td className="px-4 py-3 font-medium">{line.productName}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatQuantity(line.plannedQuantity)}</td>
                        <td className="px-4 py-3 text-right">{formatQuantity(line.actualQuantity)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatPKR(line.unitCost)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatPKR(line.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/20">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Material total</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatPKR(run.materialCost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-5 text-sm text-muted-foreground">
                {run.status === "POSTED" ? "No material consumption rows were recorded for this run." : "Material consumption will appear after production is posted."}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="rounded-md border shadow-none ring-0">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2"><Factory className="size-4 text-emerald-700" /><h2 className="text-sm font-semibold">BOM reference</h2></div>
              <Detail label="BOM" value={run.bom.name + " · v" + run.bom.version} />
              <Detail label="Finished product" value={run.bom.finishedProductName} />
              <Detail label="Standard BOM output" value={formatQuantity(run.bom.outputQuantity)} />
              <p className="text-xs leading-5 text-muted-foreground">Consumption rows preserve the quantities and costs actually posted for this run.</p>
            </CardContent>
          </Card>

          <Card className="rounded-md border shadow-none ring-0">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2"><CalendarClock className="size-4 text-emerald-700" /><h2 className="text-sm font-semibold">Lifecycle</h2></div>
              <TimelineItem label="Created" value={formatDateTime(run.createdAt)} complete />
              <TimelineItem label="Approved" value={run.approvedAt ? formatDateTime(run.approvedAt) : "Not approved"} complete={Boolean(run.approvedAt)} />
              <TimelineItem label="Posted" value={run.postedAt ? formatDateTime(run.postedAt) : run.status === "CANCELLED" ? "Cancelled before posting" : "Not posted"} complete={Boolean(run.postedAt)} />
            </CardContent>
          </Card>

          {run.notes ? (
            <Card className="rounded-md border shadow-none ring-0">
              <CardContent className="p-5">
                <p className="text-sm font-semibold">Notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{run.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}

function TimelineItem({ label, value, complete }: { label: string; value: string; complete: boolean }) {
  return <div className="flex gap-3"><span className={complete ? "mt-1 size-2.5 rounded-full bg-emerald-600" : "mt-1 size-2.5 rounded-full border bg-background"} /><div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{value}</p></div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const className = status === "POSTED"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : status === "CANCELLED"
      ? "border-slate-200 bg-slate-100 text-slate-700"
      : status === "APPROVED"
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : "border-amber-200 bg-amber-50 text-amber-800";
  return <span className={"rounded-full border px-2.5 py-1 text-xs font-semibold " + className}>{status}</span>;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-PK", { maximumFractionDigits: 4 }).format(value);
}

function formatSignedQuantity(value: number) {
  const formatted = formatQuantity(Math.abs(value));
  if (value > 0) return "+" + formatted;
  if (value < 0) return "-" + formatted;
  return "0";
}
