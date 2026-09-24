import Image from "next/image";

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

          {/* Keep the source mark in document.images so auto-print waits for it to decode. */}
          <Image
            src={branding.markPath}
            alt=""
            aria-hidden="true"
            width={1}
            height={1}
            loading="eager"
            fetchPriority="high"
            unoptimized
            className="pointer-events-none absolute h-px w-px opacity-0"
          />

          {/*
            Print-safe monochrome rendering for opaque logo files.
            The source WebP has a black background. Instead of relying on CSS
            filters or CSS masks (which Chromium/Electron can flatten into a
            black square while printing), convert source luminance into alpha
            inside SVG: dark pixels become transparent and bright logo pixels
            become solid black. This is deterministic on black-and-white
            printers and needs no printed background graphics.
          */}
          <svg
            viewBox="0 0 96 96"
            role="img"
            aria-label={`${branding.logoAlt} monogram`}
            className="hidden h-14 w-14 shrink-0 overflow-visible print:block"
          >
            <defs>
              <filter id="munshios-print-monogram-luma" colorInterpolationFilters="sRGB">
                <feColorMatrix
                  type="matrix"
                  values="0 0 0 0 0
                          0 0 0 0 0
                          0 0 0 0 0
                          0.2126 0.7152 0.0722 0 0"
                  result="luminanceAlpha"
                />
                <feComponentTransfer in="luminanceAlpha">
                  <feFuncA type="linear" slope="3" intercept="-1" />
                </feComponentTransfer>
              </filter>
            </defs>
            <image
              href={branding.markPath}
              x="0"
              y="0"
              width="96"
              height="96"
              preserveAspectRatio="xMidYMid meet"
              filter="url(#munshios-print-monogram-luma)"
            />
          </svg>
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
