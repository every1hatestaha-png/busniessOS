import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({ title, description, action }: { title: string; description: string; action?: { label: string; href: string; icon?: LucideIcon } }) {
  const Icon = action?.icon;
  return <header className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h1 className="break-words text-xl font-semibold tracking-tight text-foreground">{title}</h1><p className="mt-1 max-w-3xl break-words text-sm text-muted-foreground">{description}</p></div>{action && <Button size="sm" className="w-full sm:w-auto" nativeButton={false} render={<Link href={action.href} />}>{Icon && <Icon className="size-3.5" />}{action.label}</Button>}</header>;
}
