import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { APPROVED_HOST, APPROVED_SHA, validateSmokeEnvironment, runProtectedPreviewSmoke } =
  require("../../scripts/rc132-protected-preview-smoke.cjs");

const config = () => ({
  VERCEL_AUTOMATION_BYPASS_SECRET: "synthetic-preview-only",
  RC132_STAGING_URL: `https://${APPROVED_HOST}/`,
  RC132_EXPECTED_SHA: APPROVED_SHA,
});

function reply(status: number, body: object, contentType = "application/json") {
  return {
    status,
    headers: { get: (_: string) => contentType },
    json: async () => body,
  };
}

describe("RC132 protected hosted Preview acceptance", () => {
  it("checks exact Preview URL, expected revision, JSON and both healthy endpoints", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(reply(200, { ok: true }))
      .mockResolvedValueOnce(reply(200, {
        ok: true, database: "ready", auth: "configured", revision: APPROVED_SHA.slice(0, 12),
      }));
    const result = await runProtectedPreviewSmoke(config(), fetcher);
    expect(result).toEqual({
      health: "PASS", readiness: "PASS", revision: APPROVED_SHA.slice(0, 12),
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      `https://${APPROVED_HOST}/api/health`,
      `https://${APPROVED_HOST}/api/readiness`,
    ]);
    const settings = fetcher.mock.calls[0][1];
    expect(settings.redirect).toBe("manual");
    expect(settings.cache).toBe("no-store");
    expect(settings.method).toBe("GET");
    expect(settings.headers["x-vercel-protection-bypass"]).toBe(config().VERCEL_AUTOMATION_BYPASS_SECRET);
  });

  it.each([
    { RC132_STAGING_URL: "https://munshios.tech/" },
    { RC132_STAGING_URL: "https://evil.example/preview" },
    { RC132_STAGING_URL: `http://${APPROVED_HOST}/` },
    { RC132_STAGING_URL: `https://${APPROVED_HOST}/api/health` },
    { RC132_STAGING_URL: `https://${APPROVED_HOST}/?x-vercel-protection-bypass=exposed` },
    { RC132_STAGING_URL: `https://user:password@${APPROVED_HOST}/` },
    { RC132_EXPECTED_SHA: "0000000000000000000000000000000000000000" },
    { VERCEL_AUTOMATION_BYPASS_SECRET: "" },
    { VERCEL_AUTOMATION_BYPASS_SECRET: "test\r\nX-Injected: true" },
  ])("fails closed before requests for wrong host/sha/credential: %j", async (override) => {
    const fetcher = vi.fn();
    await expect(runProtectedPreviewSmoke({ ...config(), ...override }, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cannot mistake a deployment-protection HTML page for healthy JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(200, { ok: true }, "text/html"));
    await expect(runProtectedPreviewSmoke(config(), fetcher)).rejects.toThrow(/non-JSON/);
  });

  it("rejects 401 Vercel protection and 503 readiness without logging response body", async () => {
    const denied = vi.fn().mockResolvedValue(reply(401, { secret: "should-stay-private" }));
    await expect(runProtectedPreviewSmoke(config(), denied)).rejects.toThrow("HTTP 401");
    const unavailable = vi.fn()
      .mockResolvedValueOnce(reply(200, { ok: true }))
      .mockResolvedValueOnce(reply(503, { detail: "db-password-must-not-appear" }));
    await expect(runProtectedPreviewSmoke(config(), unavailable)).rejects.toThrow("HTTP 503");
  });

  it.each([
    { ok: false, database: "ready", auth: "configured", revision: APPROVED_SHA.slice(0,12) },
    { ok: true, database: "schema_pending", auth: "configured", revision: APPROVED_SHA.slice(0,12) },
    { ok: true, database: "ready", auth: "misconfigured", revision: APPROVED_SHA.slice(0,12) },
    { ok: true, database: "ready", auth: "configured", revision: "wrong-sha" },
  ])("rejects an unhealthy/mismatched readiness body: %j", async (body) => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply(200, { ok: true })).mockResolvedValueOnce(reply(200, body));
    await expect(runProtectedPreviewSmoke(config(), fetcher)).rejects.toThrow();
  });

  it("does not accept missing or malformed response content", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => "application/json" }, json: async () => { throw new Error("malformed"); } });
    await expect(runProtectedPreviewSmoke(config(), fetcher)).rejects.toThrow(/invalid JSON/);
    expect(() => validateSmokeEnvironment({ ...config(), RC132_STAGING_URL: "not-a-url" })).toThrow();
  });
});
