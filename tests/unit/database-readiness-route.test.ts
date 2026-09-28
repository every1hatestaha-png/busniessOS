import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkDatabaseReadiness } = vi.hoisted(() => ({
  checkDatabaseReadiness: vi.fn(),
}));

vi.mock("@/lib/server/database-readiness", () => ({ checkDatabaseReadiness }));

import { GET } from "@/app/api/readiness/route";

describe("database readiness endpoint", () => {
  beforeEach(() => {
    checkDatabaseReadiness.mockReset();
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.FBR_DI_PRODUCTION_TRANSMISSION_ENABLED;
    delete process.env.FBR_DI_CREDENTIAL_ENCRYPTION_KEY;
  });

  it("returns database readiness and only the short release revision when ready", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "5127483238af1b63598eb39dff5bb64f6a2a9ed7";
    checkDatabaseReadiness.mockResolvedValue({ ready: true, pendingCount: 0 });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      database: "ready",
      revision: "5127483238af",
    });
  });

  it("does not expose FBR credential or transmission posture", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "5127483238af1b63598eb39dff5bb64f6a2a9ed7";
    process.env.FBR_DI_PRODUCTION_TRANSMISSION_ENABLED = "1";
    process.env.FBR_DI_CREDENTIAL_ENCRYPTION_KEY = "sensitive-deployment-state";
    checkDatabaseReadiness.mockResolvedValue({ ready: true, pendingCount: 0 });

    const response = await GET();
    const payload = await response.json();
    expect(payload).toEqual({ ok: true, database: "ready", revision: "5127483238af" });
    expect(payload).not.toHaveProperty("fbr");
  });

  it("uses a null revision outside a Vercel commit deployment", async () => {
    checkDatabaseReadiness.mockResolvedValue({ ready: true, pendingCount: 0 });
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ ok: true, database: "ready", revision: null });
  });

  it("fails closed when migrations are pending", async () => {
    checkDatabaseReadiness.mockResolvedValue({ ready: false, pendingCount: 2 });
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, database: "schema_pending", revision: null });
  });

  it("fails closed without exposing database errors", async () => {
    checkDatabaseReadiness.mockRejectedValue(new Error("credential or host detail"));
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, database: "unavailable", revision: null });
  });
});
