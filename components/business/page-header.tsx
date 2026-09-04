import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({ title, description, action }: { title: string; description: string; action?: { label: string; href: string; icon?: LucideIcon } }) {
  const Icon = action?.icon;
  return <div className="flex items-end justify-between gap-4"><div><h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>{action && <Button size="sm" render={<Link href={action.href} />}>{Icon && <Icon className="size-3.5" />}{action.label}</Button>}</div>;
}
