import Link from "next/link";
import type { ReactNode } from "react";

import { cn, formatPKR } from "@/lib/utils";

export function FinancialTable({ children, className }: { children: ReactNode; className?: string }) {
  return <div className="overflow-x-auto"><table className={cn("w-full border-collapse text-xs", className)}>{children}</table></div>;
}

export function FinancialHead({ children }: { children: ReactNode }) {
  return <thead className="border-y border-neutral-300 bg-neutral-100 text-[10px] uppercase tracking-wide text-neutral-600">{children}</thead>;
}

export function FinancialRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-b border-neutral-200 hover:bg-neutral-50 print:break-inside-avoid", className)}>{children}</tr>;
}

export function FinancialCell({ children, numeric = false, className, colSpan }: { children: ReactNode; numeric?: boolean; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("px-2 py-1.5 align-top", numeric && "text-right tabular-nums", className)}>{children}</td>;
}

export function FinancialHeading({ children, numeric = false, className }: { children: ReactNode; numeric?: boolean; className?: string }) {
  return <th className={cn("whitespace-nowrap px-2 py-2 text-left font-semibold", numeric && "text-right", className)}>{children}</th>;
}

export function Money({ value, dashZero = false }: { value: number; dashZero?: boolean }) {
  return <>{dashZero && value === 0 ? "-" : formatPKR(value)}</>;
}

export function SourceDocumentLink({ href, children }: { href: string | null; children: ReactNode }) {
  return href ? <Link href={href} className="font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-900 print:no-underline">{children}</Link> : <>{children}</>;
}

export function EmptyReportRow({ colSpan, message = "No records match these filters." }: { colSpan: number; message?: string }) {
  return <FinancialRow><FinancialCell colSpan={colSpan} className="py-10 text-center text-sm text-neutral-500">{message}</FinancialCell></FinancialRow>;
}
