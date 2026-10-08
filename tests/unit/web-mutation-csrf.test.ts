import { describe, expect, it } from "vitest";
import { isAllowedMutationRequest, isSameOriginWebMutation } from "@/lib/server/cors";

const origin = "https://staging.example.invalid";
const request = (headers: Record<string, string>, path = "/api/v1/sales", method = "POST") => new Request(origin + path, { method, headers });

describe("web mutation CSRF evidence", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("fails closed for cookie %s without Origin and Fetch Metadata", method => {
    expect(isAllowedMutationRequest(request({ cookie: "sb-example-auth-token=synthetic" }, undefined, method))).toBe(false);
    expect(isAllowedMutationRequest(request({ cookie: "__session=synthetic", authorization: "Bearer attacker-added" }, undefined, method))).toBe(false);
  });
  it.each<Record<string, string>>([
    {}, { origin: "null" }, { origin: "https://evil.example.invalid" },
    { origin: "https://staging.example.invalid.evil.test" },
    { origin: origin + "/path" }, { origin: "https://user@staging.example.invalid" },
    { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "none" }, { "sec-fetch-site": "invalid" },
    { referer: "https://evil.example.invalid/form" },
    { origin: "null", referer: origin + "/form" },
    { origin, "sec-fetch-site": "cross-site" },
    { origin: "http://localhost:8081", cookie: "sb-example-auth-token=x" },
  ])("denies insufficient or contradictory web proof: %j", headers => {
    expect(isSameOriginWebMutation(request(headers))).toBe(false);
    expect(isAllowedMutationRequest(request(headers))).toBe(false);
  });
  it.each<Record<string, string>>([
    { origin }, { origin, "sec-fetch-site": "same-origin" },
    { "sec-fetch-site": "same-origin" }, { referer: origin + "/legacy-form" },
    { origin, "sec-fetch-site": "none" },
  ])("preserves browser and older same-origin clients: %j", headers => {
    expect(isAllowedMutationRequest(request({ cookie: "sb-example-auth-token=x", ...headers }))).toBe(true);
  });
  it("preserves non-cookie native bearer and Expo bearer clients only on API v1", () => {
    expect(isAllowedMutationRequest(request({ authorization: "Bearer synthetic" }))).toBe(true);
    expect(isAllowedMutationRequest(request({ authorization: "Bearer synthetic", origin: "http://localhost:8081", "sec-fetch-site": "cross-site" }))).toBe(true);
    for (const path of ["/api/ai/chat", "/auth/recovery/start", "/restaurant/pos"]) {
      expect(isAllowedMutationRequest(request({ authorization: "Bearer synthetic" }, path))).toBe(false);
    }
    for (const authorization of ["Basic synthetic", "Bearer", "Bearer x y", "Bearer x,y"]) {
      expect(isAllowedMutationRequest(request({ authorization }))).toBe(false);
    }
    expect(isAllowedMutationRequest(request({ authorization: "Bearer x", origin: "https://evil.example.invalid" }))).toBe(false);
    expect(isAllowedMutationRequest(request({ authorization: "Bearer x", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isAllowedMutationRequest(request({ authorization: "Bearer x", cookie: "businessos_workspace=a", origin: "http://localhost:8081" }))).toBe(false);
  });
  it.each(["GET", "HEAD", "OPTIONS"])("preserves read and preflight method %s", method => {
    expect(isAllowedMutationRequest(request({ origin: "https://evil.example.invalid" }, undefined, method))).toBe(true);
  });
});
