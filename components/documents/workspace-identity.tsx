import Image from "next/image";

import { PrintSafeMonogram } from "@/components/documents/print-safe-monogram";
import { getWorkspaceBranding } from "@/lib/workspace-branding";

export type WorkspaceIdentityDetails = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  ntn?: string | null;
  strn?: string | null;
};

export function WorkspaceIdentity({
  workspace,
  eyebrow,
  nameClassName = "text-2xl font-bold",
  detailsClassName = "mt-2 space-y-0.5 text-sm text-neutral-600",
}: {
  workspace: WorkspaceIdentityDetails;
  eyebrow?: string;
  nameClassName?: string;
  detailsClassName?: string;
}) {
  const branding = getWorkspaceBranding(workspace.name);
  const location = [workspace.address, workspace.city, workspace.country].filter(Boolean).join(", ");
  const contact = [workspace.phone, workspace.email].filter(Boolean).join("  |  ");
  const taxIdentity = [
    workspace.ntn ? `NTN: ${workspace.ntn}` : null,
    workspace.strn ? `STRN: ${workspace.strn}` : null,
  ].filter(Boolean).join("  |  ");

  return (
    <div className="flex min-w-0 items-start gap-4">
      {branding && (
        <>
          <Image
            src={branding.logoPath}
            alt={branding.logoAlt}
            width={150}
            height={100}
            loading="eager"
            fetchPriority="high"
            unoptimized
            className="h-16 w-auto max-w-[110px] shrink-0 rounded-sm object-contain print:hidden"
          />
          <PrintSafeMonogram
            src={branding.markPath}
            alt={`${branding.logoAlt} monogram`}
          />
        </>
      )}
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">{eyebrow}</p>}
        <p className={`${eyebrow ? "mt-2 " : ""}${nameClassName}`}>{workspace.name}</p>
        <div className={detailsClassName}>
          {location && <p>{location}</p>}
          {contact && <p>{contact}</p>}
          {taxIdentity && <p className="pt-1 font-medium">{taxIdentity}</p>}
        </div>
      </div>
    </div>
  );
}
