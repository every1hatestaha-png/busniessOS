import type { ReactNode } from "react";

import { WorkspaceIdentity, type WorkspaceIdentityDetails } from "@/components/documents/workspace-identity";

export type DocumentWorkspace = WorkspaceIdentityDetails;

export function DocumentHeader({ workspace, title, number, details }: { workspace: DocumentWorkspace; title: string; number: string; details?: ReactNode }) {
  return (
    <header className="border-b-2 border-neutral-950 pb-5">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <WorkspaceIdentity
          workspace={workspace}
          nameClassName="text-xl font-bold tracking-tight"
          detailsClassName="mt-1 space-y-0.5 text-xs leading-5 text-neutral-600"
        />
        <div className="sm:max-w-[48%] sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">{title}</p>
          <h1 className="mt-1 font-mono text-xl font-bold tracking-tight">{number}</h1>
          {details && <div className="mt-2 space-y-0.5 text-xs leading-5 text-neutral-600">{details}</div>}
        </div>
      </div>
    </header>
  );
}
