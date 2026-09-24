import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isReorderAttentionNeeded } from "@/lib/stock-attention";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("dashboard attention semantics", () => {
  it("treats a zero reorder level as not configured", () => {
    expect(isReorderAttentionNeeded(0, 0)).toBe(false);
    expect(isReorderAttentionNeeded(-2, 0)).toBe(false);
    expect(isReorderAttentionNeeded(4, 5)).toBe(true);
    expect(isReorderAttentionNeeded(5, 5)).toBe(true);
    expect(isReorderAttentionNeeded(6, 5)).toBe(false);
  });

  it("only queries configured reorder thresholds and groups stock into one action", () => {
    const daily = source("lib/server/daily-action-center.ts");
    const dashboard = source("lib/server/dashboard.ts");

    expect(daily).toContain('reorderLevel: { gt: 0 }');
    expect(dashboard).toContain('reorderLevel: { gt: 0 }');
    expect(daily).toContain('id: "stock-summary"');
    expect(daily).not.toContain('id: "stock-more"');
  });

  it("renders the full tenant logo at a readable sidebar size without manual cropping", () => {
    const sidebar = source("components/layout/sidebar.tsx");

    expect(sidebar).toContain('h-[64px] w-[96px]');
    expect(sidebar).toContain("branding.logoPath");
    expect(sidebar).toContain("object-contain");
    expect(sidebar).toContain("brightness-125");
    expect(sidebar).not.toContain('h-[72px] w-[108px]');
  });
});
