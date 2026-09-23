import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkDatabaseReadiness, getFbrCredentialDeploymentReadiness } = vi.hoisted(() => ({
  checkDatabaseReadiness: vi.fn(),
  getFbrCredentialDeploymentReadiness: vi.fn(),
}));

vi.mock("@/lib/server/database-readiness", () => ({ checkDatabaseReadiness }));
vi.mock("@/lib/server/fbr-credentials", () => ({ getFbrCredentialDeploymentReadiness }));

import { GET } from "@/app/api/readiness/route";

describe("database readiness endpoint", () => {
  beforeEach(() => {
    checkDatabaseReadiness.mockReset();
    getFbrCredentialDeploymentReadiness.mockReset();
    getFbrCredentialDeploymentReadiness.mockReturnValue({
      credentialEncryption: "configured",
      productionTransmission: "disabled",
    });
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  });

  it("returns ready only when the deployed runtime database has every shipped migration", async () => {
    checkDatabaseReadiness.mockResolvedValue({ ready: true, pendingCount: 0 });
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      database: "ready",
      revision: null,
      fbr: { credentialEncryption: "configured", productionTransmission: "disabled" },
    });
  });

  it("reports the non-secret Vercel deployment revision and safe FBR deployment state", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "5127483238af1b63598eb39dff5bb64f6a2a9ed7";
    checkDatabaseReadiness.mockResolvedValue({ ready: true, pendingCount: 0 });
    getFbrCredentialDeploymentReadiness.mockReturnValue({
      credentialEncryption: "missing",
      productionTransmission: "disabled",
    });
    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      database: "ready",
      revision: "5127483238af",
      fbr: { credentialEncryption: "missing", productionTransmission: "disabled" },
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
