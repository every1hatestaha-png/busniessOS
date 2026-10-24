import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("standalone cheque printing contract", () => {
  it("is permission protected and does not post transactions", () => {
    const page = read("app/(dashboard)/accounting/cheque-printing/page.tsx");
    const form = read("components/cheques/standalone-cheque-printer.tsx");
    expect(page).toContain('requirePermission("financial.manage")');
    expect(form).toContain("window.print()");
    expect(form).toContain("formatPkrAmountInWords");
    expect(form).toContain("data-cheque-print");
    expect(form).not.toMatch(/fetch\(|axios|use server|prisma|db\./);
  });

  it("is reachable from the finance navigation", () => {
    expect(read("components/layout/sidebar.tsx")).toContain('href: "/accounting/cheque-printing"');
    expect(read("lib/verticals/experience.ts")).toContain('"/accounting/cheque-printing"');
  });
});
