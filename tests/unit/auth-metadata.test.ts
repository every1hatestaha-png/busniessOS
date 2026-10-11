import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const authLayouts = [
  ["sign-in", "app/sign-in/layout.tsx", "/sign-in"],
  ["sign-up", "app/sign-up/layout.tsx", "/sign-up"],
  ["forgot-password", "app/forgot-password/layout.tsx", "/forgot-password"],
  ["recovery", "app/recovery/layout.tsx", "/recovery/new-password"],
  ["account-recovery", "app/account-recovery/layout.tsx", "/account-recovery"],
] as const;

describe("auth route metadata", () => {
  it.each(authLayouts)("%s is noindex and has a route-specific canonical", (_name, path, canonical) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source).toContain("index: false");
    expect(source).toContain("follow: false");
    expect(source).toContain(`canonical: "${canonical}"`);
  });
});
