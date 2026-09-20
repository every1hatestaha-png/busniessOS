import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkDatabaseReadiness } = vi.hoisted(() => ({ checkDatabaseReadiness: vi.fn() }));

vi.mock("@/lib/server/database-readiness", () => ({ checkDatabaseReadiness }));

import { GET } from "@/app/api/readiness/route";

describe("database readiness endpoint", () => {
  beforeEach(() => {
    checkDatabaseReadiness.mockReset();
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  });

  it("returns ready only when the deployed runtime database has every shipped migration", async () => {
    checkDatabaseReadiness.mockResolvedValue({ ready: true, pendingCount: 0 });
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, database: "ready", revision: null });
  });

  it("reports the non-secret Vercel deployment revision", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "5127483238af1b63598eb39dff5bb64f6a2a9ed7";
    checkDatabaseReadiness.mockResolvedValue({ ready: true, pendingCount: 0 });
    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      database: "ready",
      revision: "5127483238af",
    });
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
