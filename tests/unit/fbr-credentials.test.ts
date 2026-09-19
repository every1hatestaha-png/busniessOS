import { afterEach, describe, expect, it } from "vitest";

import { FbrCredentialError, resolveFbrBearerToken } from "@/lib/server/fbr-credentials";

const touched = [
  "FBR_DI_ALLOW_SHARED_TOKEN",
  "FBR_DI_PRODUCTION_TRANSMISSION_ENABLED",
  "FBR_DI_SANDBOX_BEARER_TOKEN",
  "FBR_DI_PRODUCTION_BEARER_TOKEN",
  "FBR_DI_SANDBOX_TOKEN_ABC_123",
  "FBR_DI_PRODUCTION_TOKEN_ABC_123",
] as const;
const original = new Map(touched.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of touched) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("FBR credential resolver", () => {
  it("keeps production transmission default-deny even when a production token exists", () => {
    process.env.FBR_DI_PRODUCTION_TOKEN_ABC_123 = "production-secret";
    delete process.env.FBR_DI_PRODUCTION_TRANSMISSION_ENABLED;

    try {
      resolveFbrBearerToken("abc-123", "PRODUCTION");
      throw new Error("Expected production transmission to be disabled.");
    } catch (error) {
      expect(error).toBeInstanceOf(FbrCredentialError);
      expect((error as FbrCredentialError).code).toBe("PRODUCTION_TRANSMISSION_DISABLED");
    }
  });

  it("keeps sandbox and production workspace credentials isolated", () => {
    process.env.FBR_DI_SANDBOX_TOKEN_ABC_123 = " sandbox-secret ";
    process.env.FBR_DI_PRODUCTION_TOKEN_ABC_123 = " production-secret ";
    process.env.FBR_DI_PRODUCTION_TRANSMISSION_ENABLED = "1";

    expect(resolveFbrBearerToken("abc-123", "SANDBOX")).toEqual({
      token: "sandbox-secret",
      source: "workspace",
    });
    expect(resolveFbrBearerToken("abc-123", "PRODUCTION")).toEqual({
      token: "production-secret",
      source: "workspace",
    });
  });

  it("never crosses a sandbox credential into production", () => {
    process.env.FBR_DI_SANDBOX_TOKEN_ABC_123 = "sandbox-secret";
    delete process.env.FBR_DI_PRODUCTION_TOKEN_ABC_123;
    process.env.FBR_DI_PRODUCTION_TRANSMISSION_ENABLED = "1";

    try {
      resolveFbrBearerToken("abc-123", "PRODUCTION");
      throw new Error("Expected a missing production credential.");
    } catch (error) {
      expect(error).toBeInstanceOf(FbrCredentialError);
      expect((error as FbrCredentialError).code).toBe("CREDENTIAL_MISSING");
    }
  });

  it("requires explicit opt-in before using a shared token", () => {
    delete process.env.FBR_DI_SANDBOX_TOKEN_ABC_123;
    delete process.env.FBR_DI_ALLOW_SHARED_TOKEN;
    process.env.FBR_DI_SANDBOX_BEARER_TOKEN = "shared-secret";

    expect(() => resolveFbrBearerToken("abc-123", "SANDBOX")).toThrow(FbrCredentialError);
  });

  it("uses only the shared token for the requested environment", () => {
    delete process.env.FBR_DI_SANDBOX_TOKEN_ABC_123;
    process.env.FBR_DI_ALLOW_SHARED_TOKEN = "1";
    process.env.FBR_DI_PRODUCTION_TRANSMISSION_ENABLED = "1";
    process.env.FBR_DI_SANDBOX_BEARER_TOKEN = " sandbox-shared ";
    process.env.FBR_DI_PRODUCTION_BEARER_TOKEN = " production-shared ";

    expect(resolveFbrBearerToken("abc-123", "SANDBOX")).toEqual({
      token: "sandbox-shared",
      source: "shared",
    });
    expect(resolveFbrBearerToken("abc-123", "PRODUCTION")).toEqual({
      token: "production-shared",
      source: "shared",
    });
  });

  it("never returns an empty configured token", () => {
    process.env.FBR_DI_SANDBOX_TOKEN_ABC_123 = "   ";
    process.env.FBR_DI_ALLOW_SHARED_TOKEN = "1";
    process.env.FBR_DI_SANDBOX_BEARER_TOKEN = "   ";

    expect(() => resolveFbrBearerToken("abc-123", "SANDBOX")).toThrow(FbrCredentialError);
  });
});
