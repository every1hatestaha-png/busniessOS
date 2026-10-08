import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), remote: vi.fn(), stored: vi.fn(), transaction: vi.fn(), encrypt: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/authorization", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/fbr/reference", () => ({ fetchFbrProvinces: m.remote }));
vi.mock("@/lib/server/fbr-credentials", () => ({ encryptFbrBearerToken: m.encrypt, FbrCredentialError: class extends Error {} }));
vi.mock("@/lib/server/db", () => ({ db: { fbrIntegrationCredential: { findUnique: m.stored }, $transaction: m.transaction } }));
import { saveFbrWorkspaceCredentialAction } from "@/app/(dashboard)/settings/actions";
const form = (environment = "SANDBOX", enabled = true, token = "synthetic-credential-only") => {
  const data = new FormData(); data.set("environment", environment); data.set("token", token);
  if (enabled) data.set("enabled", "on");
  return data;
};
describe("FBR enablement is explicitly authorized before remote credential checks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.permission.mockResolvedValue({ role: "OWNER", workspaceId: "tenant-a", user: { id: "owner-a" } });
    m.encrypt.mockReturnValue("encrypted-synthetic");
    vi.stubEnv("FBR_DI_PRODUCTION_TRANSMISSION_ENABLED", "0");
    vi.stubEnv("VERCEL_ENV", "preview");
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each(["STAFF", "MANAGER", "ADMIN"])("%s cannot enable or send a credential", async role => {
    m.permission.mockResolvedValue({ role, workspaceId: "tenant-a", user: { id: "synthetic" } });
    expect(await saveFbrWorkspaceCredentialAction({}, form())).toMatchObject({ status: "error" });
    expect(m.remote).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it("denies a supplied token when enablement was not explicitly requested", async () => {
    expect(await saveFbrWorkspaceCredentialAction({}, form("SANDBOX", false))).toMatchObject({ status: "error" });
    expect(m.remote).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each(["synthetic-credential-only", ""])("blocks production enablement in Preview with token %s", async token => {
    vi.stubEnv("FBR_DI_PRODUCTION_TRANSMISSION_ENABLED", "1");
    expect(await saveFbrWorkspaceCredentialAction({}, form("PRODUCTION", true, token))).toMatchObject({ status: "error" });
    expect(m.remote).not.toHaveBeenCalled(); expect(m.stored).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it("does not send a credential when encryption is unavailable", async () => {
    m.encrypt.mockImplementation(() => { throw new Error("Synthetic encryption failure"); });
    expect(await saveFbrWorkspaceCredentialAction({}, form())).toMatchObject({ status: "error" });
    expect(m.remote).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it("preserves the explicitly enabled owner sandbox verification path", async () => {
    m.remote.mockResolvedValue([]);
    expect(await saveFbrWorkspaceCredentialAction({}, form())).toMatchObject({ status: "error" });
    expect(m.permission).toHaveBeenCalledWith("workspace.manage");
    expect(m.encrypt).toHaveBeenCalledExactlyOnceWith("synthetic-credential-only", "tenant-a", "SANDBOX");
    expect(m.remote).toHaveBeenCalledOnce();
    expect(m.transaction).not.toHaveBeenCalled();
  });
});
