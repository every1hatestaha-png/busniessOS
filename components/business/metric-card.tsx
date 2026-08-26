import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) {
  return <Card className="shadow-none"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-neutral-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p></div><span className="rounded-lg bg-neutral-100 p-2 text-neutral-600"><Icon className="h-4 w-4" /></span></div><p className="mt-2 text-xs text-neutral-500">{detail}</p></CardContent></Card>;
}
