import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("SaaS onboarding UX contracts", () => {
  it("keeps a first-run checklist on the dashboard", () => {
    const dashboard = source("app/(dashboard)/dashboard/page.tsx");
    const loader = source("lib/server/dashboard.ts");

    expect(loader).toContain("customerCount");
    expect(loader).toContain("productCount");
    expect(loader).toContain("saleCount");
    expect(dashboard).toContain("Getting started");
    expect(dashboard).toContain("Add your first customer");
    expect(dashboard).toContain("Add your first product");
    expect(dashboard).toContain("Create your first sale");
  });

  it("shows trial status and a direct plan-management path on the dashboard", () => {
    const dashboard = source("app/(dashboard)/dashboard/page.tsx");
    expect(dashboard).toContain("getWorkspaceAccess");
    expect(dashboard).toContain("Your MunshiOS trial is active");
    expect(dashboard).toContain('href="/subscription"');
  });

  it("keeps subscription state, pricing, and activation semantics explicit", () => {
    const page = source("app/subscription/page.tsx");
    const form = source("components/subscription/subscription-request-form.tsx");

    expect(page).toContain("Plan and subscription");
    expect(page).toContain("Review plans and pricing");
    expect(page).toContain('href="/pricing"');
    expect(page).toContain("does not charge you automatically");
    expect(form).toContain("submitting it does not charge you");
    expect(form).toContain("Request activation");
  });

  it("keeps the 30-day trial initialized server-side for every workspace", () => {
    const subscriptions = source("lib/server/subscriptions.ts");
    expect(subscriptions).toContain("CURRENT_TIMESTAMP + INTERVAL '30 days'");
    expect(subscriptions).toContain("'TRIALING'");
  });
});
