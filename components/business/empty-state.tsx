import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({ message = "No matching records found.", href, action }: { message?: string; href?: string; action?: string }) {
  return <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-neutral-50 p-8 text-center"><SearchX className="h-7 w-7 text-neutral-400" /><p className="text-sm text-neutral-600">{message}</p>{href && action && <Button variant="outline" size="sm" render={<Link href={href} />}>{action}</Button>}</div>;
}
