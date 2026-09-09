import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/desktop-config/route";

const root = process.cwd();
const originalPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const originalOAuthClientId = process.env.CLERK_OAUTH_CLIENT_ID;

afterEach(() => {
  if (originalPublishableKey === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalPublishableKey;
  if (originalOAuthClientId === undefined) delete process.env.CLERK_OAUTH_CLIENT_ID;
  else process.env.CLERK_OAUTH_CLIENT_ID = originalOAuthClientId;
});

describe("desktop secret boundary", () => {
  it("never packages server secrets or a database connection", () => {
    const main = fs.readFileSync(path.join(root, "desktop", "main.cjs"), "utf8");
    const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

    expect(main).not.toMatch(/runtime\.env/);
    expect(main).not.toMatch(/CLERK_SECRET_KEY/);
    expect(main).not.toMatch(/CLERK_WEBHOOK_SECRET/);
    expect(main).not.toMatch(/postgres(?:ql)?:\/\//);
    expect(packageJson).not.toMatch(/\.desktop-stage|extraResources|afterPack/);
  });

  it("returns only public desktop authentication configuration", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_public-fixture";
    process.env.CLERK_OAUTH_CLIENT_ID = "public-oauth-client";

    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      publishableKey: "pk_test_public-fixture",
      oauthClientId: "public-oauth-client",
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
