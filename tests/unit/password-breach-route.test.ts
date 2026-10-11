import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/lib/server/password-breach-check", () => ({ checkPasswordAgainstBreaches: m.check }));
import { POST } from "@/app/api/auth/password-breach/route";

const password = "SyntheticLongPassword#2026";
function request(origin = "https://staging.example.invalid", data: unknown = { password }) {
  return new Request("https://staging.example.invalid/api/auth/password-breach", {
    method: "POST",
    headers: origin ? { Origin: origin, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

describe("public signup password breach preflight", () => {
  beforeEach(() => { vi.resetAllMocks(); m.check.mockResolvedValue("safe"); });
  it("screens a valid password and returns private success", async () => {
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ safe: true });
    expect(m.check).toHaveBeenCalledExactlyOnceWith(password);
  });
  it("rejects compromised and unavailable passwords without proceeding", async () => {
    m.check.mockResolvedValue("compromised");
    expect((await POST(request())).status).toBe(422);
    m.check.mockResolvedValue("unavailable");
    expect((await POST(request())).status).toBe(503);
  });
  it("rejects cross-site and missing-origin requests before lookup", async () => {
    expect((await POST(request("https://evil.example.invalid"))).status).toBe(403);
    expect((await POST(request(""))).status).toBe(403);
    expect(m.check).not.toHaveBeenCalled();
  });
  it("rejects invalid or excessive input before contacting HIBP", async () => {
    expect((await POST(request(undefined, { password: "short" }))).status).toBe(422);
    expect((await POST(request(undefined, { password: "x".repeat(3000) }))).status).toBe(422);
    expect(m.check).not.toHaveBeenCalled();
  });
});
