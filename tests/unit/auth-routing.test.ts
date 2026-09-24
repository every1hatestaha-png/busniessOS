import { describe, expect, it } from "vitest";

import { isAuthEntryPath, isPublicMarketingPath, safeInternalDestination } from "@/lib/auth-routing";

const BASE = "https://munshios.example/sign-in";

describe("auth routing security", () => {
  it("recognizes authentication entry routes", () => {
    expect(isAuthEntryPath("/sign-in")).toBe(true);
    expect(isAuthEntryPath("/sign-in/verify")).toBe(true);
    expect(isAuthEntryPath("/sign-up")).toBe(true);
    expect(isAuthEntryPath("/login")).toBe(true);
    expect(isAuthEntryPath("/signup")).toBe(true);
    expect(isAuthEntryPath("/dashboard")).toBe(false);
  });

  it("keeps only intended marketing routes public", () => {
    expect(isPublicMarketingPath("/")).toBe(true);
    expect(isPublicMarketingPath("/features")).toBe(true);
    expect(isPublicMarketingPath("/get-your-munshi")).toBe(true);
    expect(isPublicMarketingPath("/get-your-munshi/contact")).toBe(true);
    expect(isPublicMarketingPath("/dashboard")).toBe(false);
    expect(isPublicMarketingPath("/sales")).toBe(false);
  });

  it("allows same-origin internal return destinations", () => {
    expect(safeInternalDestination("/dashboard", BASE)).toBe("/dashboard");
    expect(safeInternalDestination("/sales?status=DRAFT", BASE)).toBe("/sales?status=DRAFT");
  });

  it("blocks external and protocol-relative redirect destinations", () => {
    expect(safeInternalDestination("https://evil.example", BASE)).toBe("/dashboard");
    expect(safeInternalDestination("//evil.example/path", BASE)).toBe("/dashboard");
    expect(safeInternalDestination("/\\evil.example", BASE)).toBe("/dashboard");
  });

  it("blocks auth-loop destinations", () => {
    expect(safeInternalDestination("/sign-in", BASE)).toBe("/dashboard");
    expect(safeInternalDestination("/sign-up?x=1", BASE)).toBe("/dashboard");
    expect(safeInternalDestination("/login", BASE)).toBe("/dashboard");
    expect(safeInternalDestination("/signup", BASE)).toBe("/dashboard");
  });

  it("strips malformed destinations by using the requested fallback", () => {
    expect(safeInternalDestination("\n//evil.example", BASE, "")).toBe("");
    expect(safeInternalDestination(null, BASE, "/dashboard")).toBe("/dashboard");
  });
});
