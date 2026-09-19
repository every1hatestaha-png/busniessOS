import "server-only";

export class FbrCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FbrCredentialError";
  }
}

function workspaceTokenKey(workspaceId: string) {
  return `FBR_DI_TOKEN_${workspaceId.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
}

export function resolveFbrBearerToken(workspaceId: string) {
  const scopedKey = workspaceTokenKey(workspaceId);
  const scopedToken = process.env[scopedKey]?.trim();
  if (scopedToken) return { token: scopedToken, source: "workspace" as const };

  if (process.env.FBR_DI_ALLOW_SHARED_TOKEN === "1") {
    const sharedToken = process.env.FBR_DI_BEARER_TOKEN?.trim();
    if (sharedToken) return { token: sharedToken, source: "shared" as const };
  }

  throw new FbrCredentialError(
    "No FBR bearer token is configured for this workspace. Configure a workspace-scoped secret or explicitly enable the shared-token fallback.",
  );
}


export function getFbrCredentialReadiness(workspaceId: string) {
  try {
    const resolved = resolveFbrBearerToken(workspaceId);
    return { configured: true as const, source: resolved.source };
  } catch (error) {
    if (error instanceof FbrCredentialError) {
      return { configured: false as const, source: null };
    }
    throw error;
  }
}
