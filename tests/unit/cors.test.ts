import { describe, expect, it } from "vitest";

import { applyCorsHeaders, getAllowedCorsOrigin, isApiV1Request, isTrustedMutationOrigin } from "@/lib/server/cors";

describe("API CORS", () => {
  it("matches only /api/v1 requests", () => {
    expect(isApiV1Request("/api/v1/me")).toBe(true);
    expect(isApiV1Request("/api/v1")).toBe(true);
    expect(isApiV1Request("/api/webhooks/clerk")).toBe(false);
  });

  it("allows Expo web localhost development origins", () => {
    expect(getAllowedCorsOrigin("http://localhost:8081")).toBe("http://localhost:8081");
    expect(getAllowedCorsOrigin("http://localhost:8082")).toBe("http://localhost:8082");
    expect(getAllowedCorsOrigin("http://127.0.0.1:19006")).toBe("http://127.0.0.1:19006");
  });

  it("does not allow arbitrary production origins", () => {
    expect(getAllowedCorsOrigin("https://evil.example.com")).toBeNull();
    expect(getAllowedCorsOrigin("https://localhost:8081")).toBeNull();
    expect(getAllowedCorsOrigin("http://localhost:3000")).toBeNull();
  });

  it("applies credentialed CORS headers only for allowed origins", () => {
    const allowed = applyCorsHeaders(new Response(null), "http://localhost:8081");
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8081");
    expect(allowed.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(allowed.headers.get("Vary")).toContain("Origin");

    const disallowed = applyCorsHeaders(new Response(null), "https://evil.example.com");
    expect(disallowed.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("accepts same-origin and requests without an Origin header", () => {
    expect(isTrustedMutationOrigin(null, "https://app.munshios.example")).toBe(true);
    expect(isTrustedMutationOrigin("https://app.munshios.example", "https://app.munshios.example")).toBe(true);
  });

  it("accepts only explicitly allowed cross-origin development clients", () => {
    expect(isTrustedMutationOrigin("http://localhost:8081", "https://app.munshios.example")).toBe(true);
    expect(isTrustedMutationOrigin("http://127.0.0.1:19006", "https://app.munshios.example")).toBe(true);
  });

  it("rejects malicious, malformed, and unapproved mutation origins", () => {
    expect(isTrustedMutationOrigin("https://evil.example.com", "https://app.munshios.example")).toBe(false);
    expect(isTrustedMutationOrigin("http://localhost:3000", "https://app.munshios.example")).toBe(false);
    expect(isTrustedMutationOrigin("not a url", "https://app.munshios.example")).toBe(false);
    expect(isTrustedMutationOrigin("https://app.munshios.example", "not a url")).toBe(false);
  });
});
