import "server-only";

import type { FbrEnvironment } from "@/lib/fbr/digital-invoicing";

export class FbrCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FbrCredentialError";
  }
}

function normalizedWorkspaceId(workspaceId: string) {
  return workspaceId.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
}

function workspaceTokenKey(workspaceId: string, environment: FbrEnvironment) {
  return `FBR_DI_${environment}_TOKEN_${normalizedWorkspaceId(workspaceId)}`;
}

function sharedTokenKey(environment: FbrEnvironment) {
  return `FBR_DI_${environment}_BEARER_TOKEN`;
}

export function resolveFbrBearerToken(workspaceId: string, environment: FbrEnvironment) {
  const scopedKey = workspaceTokenKey(workspaceId, environment);
  const scopedToken = process.env[scopedKey]?.trim();
  if (scopedToken) return { token: scopedToken, source: "workspace" as const };

  if (process.env.FBR_DI_ALLOW_SHARED_TOKEN === "1") {
    const sharedToken = process.env[sharedTokenKey(environment)]?.trim();
    if (sharedToken) return { token: sharedToken, source: "shared" as const };
  }

  throw new FbrCredentialError(
    `No ${environment.toLowerCase()} FBR bearer token is configured for this workspace. Configure an environment-specific workspace secret or explicitly enable the environment-specific shared-token fallback.`,
  );
}
