import type { ReactNode } from "react";

export type DocumentWorkspace = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
};

export function DocumentHeader({ workspace, title, number, details }: { workspace: DocumentWorkspace; title: string; number: string; details?: ReactNode }) {
  const location = [workspace.address, workspace.city, workspace.country].filter(Boolean).join(", ");
  const contact = [workspace.phone, workspace.email].filter(Boolean).join("  |  ");
  return (
    <header data-document-header className="border-b-2 border-neutral-950 pb-5">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <p className="text-xl font-bold tracking-tight">{workspace.name}</p>
          {location && <p className="mt-1 max-w-md text-xs leading-5 text-neutral-600">{location}</p>}
          {contact && <p className="text-xs leading-5 text-neutral-600">{contact}</p>}
        </div>
        <div className="sm:max-w-[48%] sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">{title}</p>
          <h1 className="mt-1 font-mono text-xl font-bold tracking-tight">{number}</h1>
          {details && <div className="mt-2 space-y-0.5 text-xs leading-5 text-neutral-600">{details}</div>}
        </div>
      </div>
    </header>
  );
}
