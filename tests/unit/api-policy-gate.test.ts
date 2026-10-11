import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), member: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ getOptionalCurrentUser: mocks.user }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
vi.mock("@/lib/server/db", () => ({ db: { workspaceMember: { findFirst: mocks.member } } }));
import { requireApiContext } from "@/lib/server/api";
describe("API workspace policy gate", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects direct workspace API access without durable acceptance before querying memberships", async () => {
    mocks.user.mockResolvedValue({ id: "synthetic-owner" });
    await expect(requireApiContext()).rejects.toMatchObject({ status: 403, code: "POLICY_ACCEPTANCE_REQUIRED" });
    expect(mocks.member).not.toHaveBeenCalled();
  });
  it("still requires actual membership after current acceptance", async () => {
    mocks.user.mockResolvedValue({ id: "synthetic-owner", termsAcceptedAt: new Date(), termsVersion: "2026-10-07", privacyAcknowledgedAt: new Date(), privacyVersion: "2026-10-07" });
    mocks.member.mockResolvedValue(null);
    await expect(requireApiContext()).rejects.toMatchObject({ status: 403, code: "WORKSPACE_REQUIRED" });
  });
});
