import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) {
  return <Card className="rounded-md border shadow-none ring-0"><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><span className="flex size-7 items-center justify-center rounded border bg-muted text-muted-foreground"><Icon className="size-3.5" /></span></div><p className="mt-3 text-[22px] font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></CardContent></Card>;
}
