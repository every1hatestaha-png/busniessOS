import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { outboundGatePassWorkspaceAllowed } from "@/lib/delivery-acceptance/workspace-scope";

const ahmadWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("gate pass: Ahmad-only workspace isolation", () => {
  it("enables only the explicitly allowlisted workspace ID", () => {
    expect(outboundGatePassWorkspaceAllowed(ahmadWorkspaceId, "true", ahmadWorkspaceId)).toBe(true);
    expect(outboundGatePassWorkspaceAllowed(otherWorkspaceId, "true", ahmadWorkspaceId)).toBe(false);
    expect(outboundGatePassWorkspaceAllowed(ahmadWorkspaceId, "false", ahmadWorkspaceId)).toBe(false);
    expect(outboundGatePassWorkspaceAllowed(ahmadWorkspaceId, undefined, ahmadWorkspaceId)).toBe(false);
    expect(outboundGatePassWorkspaceAllowed(ahmadWorkspaceId, "true", undefined)).toBe(false);
    expect(outboundGatePassWorkspaceAllowed(ahmadWorkspaceId, "true", "")).toBe(false);
  });

  it("fails closed for invalid, wildcard, mixed-case, partial or display-name selectors", () => {
    for (const configured of [
      "*",
      "Ahmad Traders",
      "ahmad",
      "aaaa",
      ahmadWorkspaceId.slice(0, 35),
      " " + ahmadWorkspaceId,
      ahmadWorkspaceId.toUpperCase(),
      otherWorkspaceId,
    ]) {
      expect(outboundGatePassWorkspaceAllowed(ahmadWorkspaceId, "true", configured)).toBe(false);
    }
  });

  it("requires exact authenticated workspace ID in all gate-pass screens", () => {
    const paths = [
      "app/(dashboard)/gate-passes/page.tsx",
      "app/(dashboard)/gate-passes/new/page.tsx",
      "app/(dashboard)/gate-passes/[id]/page.tsx",
    ];
    for (const path of paths) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("requireOutboundGatePassDraftFeature(workspaceId)");
      expect(source).toContain("requirePermission(");
      expect(source.indexOf("requireOutboundGatePassDraftFeature(workspaceId)"))
        .toBeGreaterThan(source.indexOf("await requirePermission("));
    }
  });

  it("guards server actions and database read/write service independently", () => {
    const action = readFileSync("app/(dashboard)/gate-passes/actions.ts", "utf8");
    expect(action).toContain("outboundGatePassDraftFeatureEnabled(context.workspaceId)");
    const service = readFileSync("lib/server/outbound-gate-passes.ts", "utf8");
    expect(service.match(/assertWorkspaceGatePassEnabled\(.*?\);/g)?.length).toBe(3);
  });

  it("does not show any gate-pass draft entry on Sales in other tenants", () => {
    const sales = readFileSync("app/(dashboard)/sales/page.tsx", "utf8");
    expect(sales).toContain("outboundGatePassDraftFeatureEnabled(workspaceId)");
  });

  it("keeps the preexisting invoice-derived gate pass for ordinary workspaces", () => {
    const source = readFileSync("app/(dashboard)/invoices/[id]/gate-pass/page.tsx", "utf8");
    expect(source).toContain("getInvoice(workspaceId, id)");
    expect(source).toContain("Print gate pass");
  });
});
