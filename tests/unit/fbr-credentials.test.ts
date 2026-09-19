import { afterEach, describe, expect, it } from "vitest";

import { FbrCredentialError, resolveFbrBearerToken } from "@/lib/server/fbr-credentials";

const touched = [
  "FBR_DI_ALLOW_SHARED_TOKEN",
  "FBR_DI_BEARER_TOKEN",
  "FBR_DI_TOKEN_ABC_123",
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
  it("prefers workspace-scoped credentials", () => {
    process.env.FBR_DI_TOKEN_ABC_123 = " scoped-secret ";
    process.env.FBR_DI_ALLOW_SHARED_TOKEN = "1";
    process.env.FBR_DI_BEARER_TOKEN = "shared-secret";

    expect(resolveFbrBearerToken("abc-123")).toEqual({
      token: "scoped-secret",
      source: "workspace",
    });
  });

  it("requires explicit opt-in before using a shared token", () => {
    delete process.env.FBR_DI_TOKEN_ABC_123;
    delete process.env.FBR_DI_ALLOW_SHARED_TOKEN;
    process.env.FBR_DI_BEARER_TOKEN = "shared-secret";

    expect(() => resolveFbrBearerToken("abc-123")).toThrow(FbrCredentialError);
  });

  it("allows shared token only when explicitly enabled", () => {
    delete process.env.FBR_DI_TOKEN_ABC_123;
    process.env.FBR_DI_ALLOW_SHARED_TOKEN = "1";
    process.env.FBR_DI_BEARER_TOKEN = " shared-secret ";

    expect(resolveFbrBearerToken("abc-123")).toEqual({
      token: "shared-secret",
      source: "shared",
    });
  });

  it("never returns an empty configured token", () => {
    process.env.FBR_DI_TOKEN_ABC_123 = "   ";
    process.env.FBR_DI_ALLOW_SHARED_TOKEN = "1";
    process.env.FBR_DI_BEARER_TOKEN = "   ";

    expect(() => resolveFbrBearerToken("abc-123")).toThrow(FbrCredentialError);
  });
});
