import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile responsive contracts", () => {
  it("keeps the dashboard shell usable on mobile", () => {
    const nav = source("components/layout/top-nav.tsx");
    expect(nav).toContain("lg:hidden");
    expect(nav).toContain("SheetContent");
    expect(nav).toContain("mobileSearchOpen");
  });

  it("keeps shared page headers and report controls responsive", () => {
    const pageHeader = source("components/business/page-header.tsx");
    const reportFrame = source("components/reports/report-frame.tsx");
    const filters = source("components/reports/report-filter-bar.tsx");

    expect(pageHeader).toContain("flex-col");
    expect(pageHeader).toContain("w-full sm:w-auto");
    expect(reportFrame).toContain("flex-col");
    expect(reportFrame).toContain("overflow-x-auto");
    expect(filters).toContain("grid-cols-1");
    expect(filters).toContain("w-full sm:w-56");
  });

  it("keeps wide financial tables horizontally scrollable", () => {
    const table = source("components/ui/table.tsx");
    expect(table).toContain("overflow-x-auto");
    expect(table).toContain("print:overflow-visible");
  });

  it("keeps statement summary cards from forcing four columns on phones", () => {
    const statement = source("components/reports/statement-table.tsx");
    expect(statement).toContain("grid-cols-1");
    expect(statement).toContain("sm:grid-cols-2");
    expect(statement).toContain("lg:grid-cols-4");
  });

  it.each([
    "app/(dashboard)/sales/[id]/page.tsx",
    "app/(dashboard)/purchases/[id]/page.tsx",
    "app/(dashboard)/goods-receipts/[id]/page.tsx",
    "app/(dashboard)/customers/[id]/page.tsx",
    "app/(dashboard)/suppliers/[id]/page.tsx",
    "app/(dashboard)/inventory/[id]/page.tsx",
  ])("stacks detail page actions on narrow screens: %s", (path) => {
    const page = source(path);
    expect(page).toContain("flex-col");
    expect(page).toContain("sm:flex-row");
    expect(page).toContain("min-w-0");
  });
});
