import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const reportSelectClassName = "h-9 w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-400 sm:h-8 sm:w-auto sm:min-w-44";

export function ReportFilterBar({ children }: { children: ReactNode }) {
  return (
    <form method="get" className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm print:hidden sm:flex sm:flex-wrap sm:items-end">
      {children}
      <Button type="submit" size="sm" className="w-full sm:w-auto">Apply filters</Button>
    </form>
  );
}

export function ReportFilterField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}{children}</label>;
}

export function PeriodFilters({ from, to }: { from: string; to: string }) {
  return (
    <>
      <ReportFilterField label="From"><Input className="w-full sm:w-36" type="date" name="from" defaultValue={from} /></ReportFilterField>
      <ReportFilterField label="To"><Input className="w-full sm:w-36" type="date" name="to" defaultValue={to} /></ReportFilterField>
    </>
  );
}

export function SearchFilter({ value = "", placeholder = "Document or description" }: { value?: string; placeholder?: string }) {
  return <ReportFilterField label="Search"><Input className="w-full sm:w-56" type="search" name="search" defaultValue={value} placeholder={placeholder} /></ReportFilterField>;
}
