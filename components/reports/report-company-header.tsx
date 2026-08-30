import { formatDate } from "@/lib/utils";

type WorkspaceDetails = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
};

export function ReportCompanyHeader({
  workspace,
  title,
  from,
  to,
  generatedAt = new Date(),
  subtitle,
}: {
  workspace: WorkspaceDetails;
  title: string;
  from?: string | Date;
  to?: string | Date;
  generatedAt?: string | Date;
  subtitle?: string;
}) {
  const location = [workspace.address, workspace.city, workspace.country].filter(Boolean).join(", ");
  const contact = [workspace.phone, workspace.email].filter(Boolean).join("  |  ");

  return (
    <header className="border-b-2 border-neutral-900 pb-4">
      <div className="flex items-start justify-between gap-8">
        <div>
          <p className="text-xl font-bold tracking-tight text-neutral-950">{workspace.name}</p>
          {location && <p className="mt-1 text-xs text-neutral-500">{location}</p>}
          {contact && <p className="text-xs text-neutral-500">{contact}</p>}
        </div>
        <div className="max-w-[55%] text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">Financial report</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950">{title}</h1>
          {subtitle && <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-neutral-200 pt-3 text-xs text-neutral-600">
        <p>{from && to ? `Period: ${formatDate(from)} to ${formatDate(to)}` : "As at report generation"}</p>
        <p>Generated: {new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(generatedAt))}</p>
      </div>
    </header>
  );
}
