import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("thermal print contract", () => {
  it("keeps the 80mm invoice action behind the same FBR print gate", () => {
    const page = readFileSync("app/(dashboard)/invoices/[id]/page.tsx", "utf8");
    expect(page).toContain('disabled={fbrPrintBlocked} format="thermal"');
    expect(page).toContain('FBR thermal blocked');
  });

  it("defines an isolated 80mm print profile", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain("@page thermal");
    expect(css).toContain("size: 80mm auto");
    expect(css).toContain('html[data-print-format="thermal"] [data-document]');
  });

  it("cleans thermal mode after printing", () => {
    const button = readFileSync("components/invoices/print-button.tsx", "utf8");
    expect(button).toContain('window.addEventListener("afterprint", cleanup)');
    expect(button).toContain("delete document.documentElement.dataset.printFormat");
  });
});
