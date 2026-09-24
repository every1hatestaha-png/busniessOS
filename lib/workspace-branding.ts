export type WorkspaceBranding = {
  /** Full company logo used on documents and print surfaces. */
  logoPath: string;
  /** Compact square mark used in sidebar/mobile app chrome. */
  markPath: string;
  logoAlt: string;
};

const ARSHAD_SONS_WORKSPACE_NAMES = new Set([
  "arshad sons",
  "arshad sons pvt ltd",
  "arshad sons private limited",
  "arshad sons and engineering solution",
  "arshad sons engineering solution",
  "arshad sons and engineering solutions",
  "arshad sons engineering solutions",
  "arshad sons and engineering solution pvt ltd",
  "arshad sons engineering solution pvt ltd",
  "arshad sons and engineering solutions pvt ltd",
  "arshad sons engineering solutions pvt ltd",
  "arshad sons and engineering solution private limited",
  "arshad sons engineering solution private limited",
  "arshad sons and engineering solutions private limited",
  "arshad sons engineering solutions private limited",
]);

function normalizeWorkspaceName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[().,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Workspace-scoped visual branding.
 *
 * Keep this resolver deliberately strict: a custom brand must never leak into
 * another tenant just because its name is similar. The accepted values below
 * are reviewed spelling/legal-name variants of the same Arshad Sons company.
 */
export function getWorkspaceBranding(workspaceName: string): WorkspaceBranding | null {
  if (!ARSHAD_SONS_WORKSPACE_NAMES.has(normalizeWorkspaceName(workspaceName))) return null;

  return {
    logoPath: "/brand/arshad-sons-engineering-solutions.webp",
    markPath: "/brand/arshad-sons-mark.webp",
    logoAlt: "Arshad Sons Engineering Solutions",
  };
}
