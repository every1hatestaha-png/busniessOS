import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { FbrEnvironment } from "@/lib/fbr/digital-invoicing";
import { db } from "@/lib/server/db";

export type FbrCredentialErrorCode =
  | "CREDENTIAL_MISSING"
  | "CREDENTIAL_ENCRYPTION_KEY_INVALID"
  | "CREDENTIAL_DECRYPTION_FAILED"
  | "PRODUCTION_TRANSMISSION_DISABLED";

export class FbrCredentialError extends Error {
  constructor(
    public readonly code: FbrCredentialErrorCode,
    message: string,
  ) {
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

function assertTransmissionAllowed(environment: FbrEnvironment) {
  if (environment === "PRODUCTION" && process.env.FBR_DI_PRODUCTION_TRANSMISSION_ENABLED !== "1") {
    throw new FbrCredentialError(
      "PRODUCTION_TRANSMISSION_DISABLED",
      "Production FBR transmission is disabled at deployment level. Complete the live-integration release checklist and explicitly enable production transmission before using production credentials.",
    );
  }
}

function credentialEncryptionKey() {
  const encoded = process.env.FBR_DI_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    throw new FbrCredentialError(
      "CREDENTIAL_ENCRYPTION_KEY_INVALID",
      "FBR workspace credential encryption is not configured on this deployment.",
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new FbrCredentialError(
      "CREDENTIAL_ENCRYPTION_KEY_INVALID",
      "FBR workspace credential encryption key must decode to exactly 32 bytes.",
    );
  }
  return key;
}

function credentialBinding(workspaceId: string, environment: FbrEnvironment) {
  return Buffer.from(`munshios:fbr:v1:${workspaceId}:${environment}`, "utf8");
}

export function encryptFbrBearerToken(
  token: string,
  workspaceId: string,
  environment: FbrEnvironment,
) {
  const plain = token.trim();
  if (!plain) {
    throw new FbrCredentialError("CREDENTIAL_MISSING", "FBR bearer token is empty.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialEncryptionKey(), iv);
  cipher.setAAD(credentialBinding(workspaceId, environment));
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptFbrBearerToken(
  envelope: string,
  workspaceId: string,
  environment: FbrEnvironment,
) {
  try {
    const [version, iv64, tag64, body64, extra] = envelope.split(".");
    if (version !== "v1" || !iv64 || !tag64 || !body64 || extra) throw new Error("Invalid envelope.");
    const decipher = createDecipheriv("aes-256-gcm", credentialEncryptionKey(), Buffer.from(iv64, "base64"));
    decipher.setAAD(credentialBinding(workspaceId, environment));
    decipher.setAuthTag(Buffer.from(tag64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(body64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof FbrCredentialError) throw error;
    throw new FbrCredentialError(
      "CREDENTIAL_DECRYPTION_FAILED",
      "The stored FBR credential could not be decrypted for this workspace and environment. Replace the credential before retrying.",
    );
  }
}

export function resolveFbrBearerToken(workspaceId: string, environment: FbrEnvironment) {
  assertTransmissionAllowed(environment);

  const scopedKey = workspaceTokenKey(workspaceId, environment);
  const scopedToken = process.env[scopedKey]?.trim();
  if (scopedToken) return { token: scopedToken, source: "workspace" as const };

  if (process.env.FBR_DI_ALLOW_SHARED_TOKEN === "1") {
    const sharedToken = process.env[sharedTokenKey(environment)]?.trim();
    if (sharedToken) return { token: sharedToken, source: "shared" as const };
  }

  throw new FbrCredentialError(
    "CREDENTIAL_MISSING",
    `No ${environment.toLowerCase()} FBR bearer token is configured for this workspace.`,
  );
}

export async function resolveFbrBearerTokenForRequest(
  workspaceId: string,
  environment: FbrEnvironment,
) {
  assertTransmissionAllowed(environment);

  const stored = await db.fbrIntegrationCredential.findUnique({
    where: { workspaceId_environment: { workspaceId, environment } },
    select: { tokenEncrypted: true, verifiedAt: true },
  });
  if (stored?.verifiedAt) {
    return {
      token: decryptFbrBearerToken(stored.tokenEncrypted, workspaceId, environment),
      source: "workspace_database" as const,
    };
  }

  return resolveFbrBearerToken(workspaceId, environment);
}
