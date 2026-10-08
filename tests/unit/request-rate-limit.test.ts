import { describe, expect, it } from "vitest";

import { checkAppRateLimit } from "@/lib/request-rate-limit";

describe("application rate limits", () => {
  it("bounds database-backed readiness checks per client", () => {
    const request = new Request("https://www.munshios.tech/api/readiness", {
      method: "GET",
      headers: { "x-forwarded-for": "203.0.113.211" },
    });

    for (let index = 0; index < 60; index += 1) {
      expect(checkAppRateLimit(request, "/api/readiness")).toBeNull();
    }

    expect(checkAppRateLimit(request, "/api/readiness")).toMatchObject({
      retryAfter: expect.any(Number),
    });
  });

  it("does not rate-limit unrelated public static routes", () => {
    const request = new Request("https://www.munshios.tech/security", {
      method: "GET",
      headers: { "x-forwarded-for": "203.0.113.212" },
    });

    expect(checkAppRateLimit(request, "/security")).toBeNull();
  });
});
