import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({ title, description, action }: { title: string; description: string; action?: { label: string; href: string; icon?: LucideIcon } }) {
  const Icon = action?.icon;
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight text-neutral-950 md:text-3xl">{title}</h1><p className="mt-1 text-sm text-neutral-500">{description}</p></div>{action && <Button render={<Link href={action.href} />}>{Icon && <Icon className="h-4 w-4" />}{action.label}</Button>}</div>;
}
