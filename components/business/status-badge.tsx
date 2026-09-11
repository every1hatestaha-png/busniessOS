import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700", COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700", RECEIVED: "border-emerald-200 bg-emerald-50 text-emerald-700", PAID: "border-emerald-200 bg-emerald-50 text-emerald-700", "In Stock": "border-emerald-200 bg-emerald-50 text-emerald-700", Clear: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PROCESSING: "border-teal-200 bg-teal-50 text-teal-800", CONFIRMED: "border-teal-200 bg-teal-50 text-teal-800", ORDERED: "border-teal-200 bg-teal-50 text-teal-800", Normal: "border-teal-200 bg-teal-50 text-teal-800",
  PARTIALLY_RECEIVED: "border-amber-200 bg-amber-50 text-amber-700", PARTIALLY_PAID: "border-amber-200 bg-amber-50 text-amber-700", UNPAID: "border-amber-200 bg-amber-50 text-amber-700", "Low Stock": "border-amber-200 bg-amber-50 text-amber-700", "Near Limit": "border-amber-200 bg-amber-50 text-amber-700",
  OVERDUE: "border-red-200 bg-red-50 text-red-700", "Out of Stock": "border-red-200 bg-red-50 text-red-700", "Over Limit": "border-red-200 bg-red-50 text-red-700", BLACKLISTED: "border-red-200 bg-red-50 text-red-700", CANCELLED: "border-red-200 bg-red-50 text-red-700", VOIDED: "border-red-200 bg-red-50 text-red-700",
  Overdue: "border-red-200 bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap font-medium", tones[status] ?? "border-border bg-muted text-muted-foreground")}>{status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</Badge>;
}
