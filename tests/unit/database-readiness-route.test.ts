import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkDatabaseReadiness } = vi.hoisted(() => ({
  checkDatabaseReadiness: vi.fn(),
}));

vi.mock("@/lib/server/database-readiness", () => ({ checkDatabaseReadiness }));

import { GET } from "@/app/api/readiness/route";

describe("database readiness endpoint", () => {
  beforeEach(() => {
    checkDatabaseReadiness.mockReset();
  });

  it("returns only minimal public readiness metadata when the deployed database is ready", async () => {
    checkDatabaseReadiness.mockResolvedValue({ ready: true, pendingCount: 0 });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      database: "ready",
    });
  });

  it("does not expose deployment revision or FBR credential posture", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "5127483238af1b63598eb39dff5bb64f6a2a9ed7";
    process.env.FBR_DI_PRODUCTION_TRANSMISSION_ENABLED = "1";
    process.env.FBR_DI_CREDENTIAL_ENCRYPTION_KEY = "sensitive-deployment-state";
    checkDatabaseReadiness.mockResolvedValue({ ready: true, pendingCount: 0 });

    const response = await GET();
    const payload = await response.json();
    expect(payload).toEqual({ ok: true, database: "ready" });
    expect(payload).not.toHaveProperty("revision");
    expect(payload).not.toHaveProperty("fbr");

    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.FBR_DI_PRODUCTION_TRANSMISSION_ENABLED;
    delete process.env.FBR_DI_CREDENTIAL_ENCRYPTION_KEY;
  });

  it("fails closed when migrations are pending", async () => {
    checkDatabaseReadiness.mockResolvedValue({ ready: false, pendingCount: 2 });
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, database: "schema_pending" });
  });

  it("fails closed without exposing database errors", async () => {
    checkDatabaseReadiness.mockRejectedValue(new Error("credential or host detail"));
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, database: "unavailable" });
  });
});
