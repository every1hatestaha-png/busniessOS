import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ config: vi.fn(), read: vi.fn(), mutate: vi.fn(), remote: vi.fn(), credentials: vi.fn(), freshness: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/server/authorization", () => ({ requirePermission: async () => ({ workspaceId: "tenant-a" }), canPerformAction: () => true }));
vi.mock("@/lib/server/db", () => ({ db: {
  fbrIntegrationConfig: { findUnique: m.config },
  fbrInvoiceSubmission: { findFirst: m.read, update: m.mutate, updateMany: m.mutate }, $transaction: m.mutate,
} }));
vi.mock("@/lib/fbr/client", () => ({ validateInvoiceWithFbr: m.remote, postInvoiceToFbr: m.remote }));
vi.mock("@/lib/server/fbr-credentials", () => ({ resolveFbrBearerTokenForRequest: m.credentials, FbrCredentialError: class extends Error {} }));
vi.mock("@/lib/server/fbr-digital-invoicing", () => ({ checkFbrSubmissionFreshness: m.freshness }));
vi.mock("@/lib/server/audit", () => ({ writeAudit: m.audit }));
import { runFbrRemoteValidation } from "@/lib/server/fbr-remote-validation";
import { runFbrInvoiceSubmission } from "@/lib/server/fbr-remote-submission";
import { getFbrReferenceOptions } from "@/lib/server/fbr-reference-options";
import { verifyProductFbrReferenceMapping } from "@/lib/server/fbr-product-mapping";

describe("FBR default deny before any side effect", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  for (const run of [runFbrRemoteValidation, runFbrInvoiceSubmission]) {
    it.each([null, { enabled: false }])(`${run.name} denies missing/disabled configuration`, async config => {
      m.config.mockResolvedValue(config);
      await expect(run("submission-a")).rejects.toThrow("disabled");
      expect(m.config).toHaveBeenCalledExactlyOnceWith({ where: { workspaceId: "tenant-a" }, select: { enabled: true, environment: true } });
      for (const fn of [m.read, m.mutate, m.remote, m.credentials, m.freshness, m.audit]) expect(fn).not.toHaveBeenCalled();
    });
    it(`${run.name} permits explicitly enabled configuration without removing idempotency`, async () => {
      m.config.mockResolvedValue({ enabled: true, environment: "SANDBOX" });
      m.read.mockResolvedValue({ status: "SUBMITTED", environment: "SANDBOX" });
      expect(await run("submission-a")).toMatchObject({ status: "SUBMITTED" });
      expect(m.read).toHaveBeenCalled();
      expect(m.remote).not.toHaveBeenCalled();
    });
    it.each(["PRODUCTION", "invalid"])(`${run.name} rejects unsafe provider environment before claims/audit`, async environment => {
      vi.stubEnv("FBR_DI_PRODUCTION_TRANSMISSION_ENABLED", "0");
      m.config.mockResolvedValue({ enabled: true, environment });
      await expect(run("submission-a")).rejects.toThrow();
      for (const fn of [m.read, m.mutate, m.remote, m.credentials, m.freshness, m.audit]) expect(fn).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });
    it(`${run.name} rejects a submission from a different configured environment before changing its state`, async () => {
      m.config.mockResolvedValue({ enabled: true, environment: "SANDBOX" });
      m.read.mockResolvedValue({ status: "DRAFT", environment: "PRODUCTION" });
      await expect(run("submission-a")).rejects.toThrow("environment mismatch");
      for (const fn of [m.mutate, m.remote, m.credentials, m.freshness, m.audit]) expect(fn).not.toHaveBeenCalled();
    });
  }
  it.each(["options", "mapping"])("disabled tenant cannot trigger remote reference %s", async kind => {
    m.config.mockResolvedValue({ enabled: false });
    const context = { workspaceId: "tenant-a", role: "OWNER" as const };
    await expect(kind === "options" ? getFbrReferenceOptions(context) : verifyProductFbrReferenceMapping(context, "product-a")).rejects.toThrow("disabled");
    for (const fn of [m.read, m.mutate, m.remote, m.credentials, m.audit]) expect(fn).not.toHaveBeenCalled();
  });
});
