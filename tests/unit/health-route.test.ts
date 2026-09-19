import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("public system endpoints", () => {
  it("returns a public readiness response without database access", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("explicitly exempts health and the Clerk webhook from Clerk protection", () => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    expect(proxy).toContain('path === "/api/health"');
    expect(proxy).toContain('path === "/api/readiness"');
    expect(proxy).toContain('path === "/api/webhooks/clerk"');
  });

  it("keeps the Clerk lifecycle webhook route present", () => {
    const webhook = readFileSync(join(process.cwd(), "app/api/webhooks/clerk/route.ts"), "utf8");
    expect(webhook).toContain("export async function POST");
    expect(webhook).toContain("svix-signature");
    expect(webhook).toContain("CLERK_WEBHOOK_SECRET");
  });
});
