import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({ title, description, action }: { title: string; description: string; action?: { label: string; href: string; icon?: LucideIcon } }) {
  const Icon = action?.icon;
  return <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action && <Button size="sm" nativeButton={false} render={<Link href={action.href} />}>{Icon && <Icon className="size-3.5" />}{action.label}</Button>}</header>;
}
