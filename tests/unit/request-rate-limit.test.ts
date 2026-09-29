import { describe, expect, it } from "vitest";

import { checkAppRateLimit } from "@/lib/request-rate-limit";

function makeRequest(ip: string, method = "POST") {
  return new Request("https://www.munshios.tech", {
    method,
    headers: { "x-forwarded-for": ip },
  });
}

describe("application rate limiting", () => {
  it("limits password recovery start requests per IP", () => {
    const request = makeRequest("203.0.113.10");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(checkAppRateLimit(request, "/auth/recovery/start")).toBeNull();
    }

    expect(checkAppRateLimit(request, "/auth/recovery/start")).toEqual(
      expect.objectContaining({ retryAfter: expect.any(Number) }),
    );
  });

  it("limits recovery verification attempts per IP", () => {
    const request = makeRequest("203.0.113.11");

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(checkAppRateLimit(request, "/auth/recovery/verify")).toBeNull();
    }

    expect(checkAppRateLimit(request, "/auth/recovery/verify")).toEqual(
      expect.objectContaining({ retryAfter: expect.any(Number) }),
    );
  });

  it("limits recovery password changes per IP", () => {
    const request = makeRequest("203.0.113.12");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(checkAppRateLimit(request, "/auth/recovery/password")).toBeNull();
    }

    expect(checkAppRateLimit(request, "/auth/recovery/password")).toEqual(
      expect.objectContaining({ retryAfter: expect.any(Number) }),
    );
  });

  it("limits authenticated AI chat requests per IP", () => {
    const request = makeRequest("203.0.113.14");

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(checkAppRateLimit(request, "/api/ai/chat")).toBeNull();
    }

    expect(checkAppRateLimit(request, "/api/ai/chat")).toEqual(
      expect.objectContaining({ retryAfter: expect.any(Number) }),
    );
  });

  it("keeps unrelated public routes outside the limiter", () => {
    expect(checkAppRateLimit(makeRequest("203.0.113.13"), "/features")).toBeNull();
  });
});
