import { describe, expect, it } from "vitest";

import { getWorkspaceBranding } from "@/lib/workspace-branding";

describe("workspace branding", () => {
  const expected = {
    logoPath: "/brand/arshad-sons-engineering-solutions.webp",
    markPath: "/brand/arshad-sons-mark.webp",
    logoAlt: "Arshad Sons Engineering Solutions",
  };

  it("applies the Arshad Sons logo to reviewed workspace-name variants", () => {
    expect(getWorkspaceBranding("Arshad Sons")).toEqual(expected);
    expect(getWorkspaceBranding("Arshad Sons and Engineering Solution")).toEqual(expected);
    expect(getWorkspaceBranding("Arshad Sons Engineering Solution")).toEqual(expected);
    expect(getWorkspaceBranding("Arshad Sons and Engineering Solutions")).toEqual(expected);
    expect(getWorkspaceBranding("Arshad Sons Engineering Solutions")).toEqual(expected);
    expect(getWorkspaceBranding("Arshad Sons Engineering Solutions (Pvt.) Ltd.")).toEqual(expected);
    expect(getWorkspaceBranding("ARSHAD SONS & ENGINEERING SOLUTIONS")).toEqual(expected);
    expect(getWorkspaceBranding("  ARSHAD   SONS AND ENGINEERING SOLUTION  ")).toEqual(expected);
  });

  it("does not leak Arshad Sons branding to unrelated workspaces", () => {
    expect(getWorkspaceBranding("Demo Engineering Solutions")).toBeNull();
    expect(getWorkspaceBranding("Arshad Trading Company")).toBeNull();
  });
});
