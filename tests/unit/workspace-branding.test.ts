import { describe, expect, it } from "vitest";

import { getWorkspaceBranding } from "@/lib/workspace-branding";

describe("workspace branding", () => {
  it("applies the Arshad Sons logo only to the exact normalized workspace name", () => {
    expect(getWorkspaceBranding("Arshad Sons Engineering Solutions")).toEqual({
      logoPath: "/brand/arshad-sons-engineering-solutions.webp",
      logoAlt: "Arshad Sons Engineering Solutions",
    });
    expect(getWorkspaceBranding("  ARSHAD   SONS ENGINEERING SOLUTIONS  ")).toEqual({
      logoPath: "/brand/arshad-sons-engineering-solutions.webp",
      logoAlt: "Arshad Sons Engineering Solutions",
    });
  });

  it("does not leak Arshad Sons branding to other or merely similar workspaces", () => {
    expect(getWorkspaceBranding("Arshad Sons")).toBeNull();
    expect(getWorkspaceBranding("Arshad Sons Engineering Solution")).toBeNull();
    expect(getWorkspaceBranding("Demo Engineering Solutions")).toBeNull();
  });
});
