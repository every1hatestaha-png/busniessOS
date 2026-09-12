import type { ReactNode } from "react";

import { DocumentHeader, type DocumentWorkspace } from "@/components/documents/document-header";
import { DocumentStatusStamp } from "@/components/documents/document-status-stamp";

export function DocumentFrame({ workspace, title, number, status, statusReason, details, children, orientation = "portrait" }: { workspace: DocumentWorkspace; title: string; number: string; status?: string; statusReason?: string | null; details?: ReactNode; children: ReactNode; orientation?: "portrait" | "landscape" }) {
  return (
    <article data-document data-print-surface data-print-orientation={orientation} className="mx-auto max-w-[210mm] bg-white p-6 text-neutral-950 shadow-sm sm:p-8 print:max-w-none print:p-0 print:shadow-none">
      <DocumentHeader workspace={workspace} title={title} number={number} details={details} />
      {status && <DocumentStatusStamp status={status} reason={statusReason} />}
      {children}
    </article>
  );
}
