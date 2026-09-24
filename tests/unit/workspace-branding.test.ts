import { describe, expect, it } from "vitest";

import { getWorkspaceBranding } from "@/lib/workspace-branding";

describe("workspace branding", () => {
  const expected = {
    logoPath: "/brand/arshad-sons-engineering-solutions.webp",
    markPath: "/brand/arshad-sons-mark.webp",
    logoAlt: "Arshad Sons Engineering Solutions",
  };

  it("applies the Arshad Sons logo to the actual workspace name", () => {
    expect(getWorkspaceBranding("Arshad Sons and Engineering Solution")).toEqual(expected);
    expect(getWorkspaceBranding("  ARSHAD   SONS AND ENGINEERING SOLUTION  ")).toEqual(expected);
  });

  it("keeps the reviewed legacy spelling as an exact fallback", () => {
    expect(getWorkspaceBranding("Arshad Sons Engineering Solutions")).toEqual(expected);
  });

  it("does not leak Arshad Sons branding to other or merely similar workspaces", () => {
    expect(getWorkspaceBranding("Arshad Sons")).toBeNull();
    expect(getWorkspaceBranding("Arshad Sons Engineering Solution")).toBeNull();
    expect(getWorkspaceBranding("Arshad Sons and Engineering Solutions")).toBeNull();
    expect(getWorkspaceBranding("Demo Engineering Solutions")).toBeNull();
  });
});
