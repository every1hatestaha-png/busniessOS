export type WorkspaceBranding = {
  logoPath: string;
  logoAlt: string;
};

const ARSHAD_SONS_WORKSPACE_NAME = "arshad sons engineering solutions";

function normalizeWorkspaceName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Workspace-scoped visual branding.
 *
 * Keep this resolver deliberately strict: a custom brand must never leak into
 * another tenant just because its name is similar. Add future tenants here only
 * with an exact, reviewed workspace identity.
 */
export function getWorkspaceBranding(workspaceName: string): WorkspaceBranding | null {
  if (normalizeWorkspaceName(workspaceName) !== ARSHAD_SONS_WORKSPACE_NAME) return null;

  return {
    logoPath: "/brand/arshad-sons-engineering-solutions.webp",
    logoAlt: "Arshad Sons Engineering Solutions",
  };
}
