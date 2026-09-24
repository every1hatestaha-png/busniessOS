export type WorkspaceBranding = {
  /** Full company logo used on documents and print surfaces. */
  logoPath: string;
  /** Compact square mark used in sidebar/mobile app chrome. */
  markPath: string;
  logoAlt: string;
};

const ARSHAD_SONS_WORKSPACE_NAMES = new Set([
  "arshad sons and engineering solution",
  "arshad sons engineering solution",
  "arshad sons and engineering solutions",
  "arshad sons engineering solutions",
]);

function normalizeWorkspaceName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Workspace-scoped visual branding.
 *
 * Keep this resolver deliberately strict: a custom brand must never leak into
 * another tenant just because its name is similar. The accepted values below
 * are reviewed spelling variants of the same Arshad Sons company name.
 */
export function getWorkspaceBranding(workspaceName: string): WorkspaceBranding | null {
  if (!ARSHAD_SONS_WORKSPACE_NAMES.has(normalizeWorkspaceName(workspaceName))) return null;

  return {
    logoPath: "/brand/arshad-sons-engineering-solutions.webp",
    markPath: "/brand/arshad-sons-mark.webp",
    logoAlt: "Arshad Sons Engineering Solutions",
  };
}
