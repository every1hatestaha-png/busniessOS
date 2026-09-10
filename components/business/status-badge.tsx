import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700", COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700", RECEIVED: "border-emerald-200 bg-emerald-50 text-emerald-700", PAID: "border-emerald-200 bg-emerald-50 text-emerald-700", "In Stock": "border-emerald-200 bg-emerald-50 text-emerald-700", Clear: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PROCESSING: "border-primary-200 bg-primary-50 text-primary-700", CONFIRMED: "border-primary-200 bg-primary-50 text-primary-700", ORDERED: "border-primary-200 bg-primary-50 text-primary-700", Normal: "border-primary-200 bg-primary-50 text-primary-700",
  PARTIALLY_RECEIVED: "border-amber-200 bg-amber-50 text-amber-700", PARTIALLY_PAID: "border-amber-200 bg-amber-50 text-amber-700", UNPAID: "border-amber-200 bg-amber-50 text-amber-700", "Low Stock": "border-amber-200 bg-amber-50 text-amber-700", "Near Limit": "border-amber-200 bg-amber-50 text-amber-700",
  OVERDUE: "border-destructive-200 bg-destructive-50 text-destructive-700", "Out of Stock": "border-destructive-200 bg-destructive-50 text-destructive-700", "Over Limit": "border-destructive-200 bg-destructive-50 text-destructive-700", BLACKLISTED: "border-destructive-200 bg-destructive-50 text-destructive-700", CANCELLED: "border-destructive-200 bg-destructive-50 text-destructive-700", VOIDED: "border-destructive-200 bg-destructive-50 text-destructive-700",
  Overdue: "border-destructive-200 bg-destructive-50 text-destructive-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap font-medium", tones[status] ?? "border-border bg-muted text-muted-foreground")}>{status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</Badge>;
}
