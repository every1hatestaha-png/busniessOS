import { describe, expect, it } from "vitest";
import { gatePassIssueStockMode } from "@/lib/delivery-acceptance/issue-stock-rollout";

const cutover = "2026-11-01T00:00:00.000Z";

describe("Gate Pass V2: future-only issue-stock cutover", () => {
  it("keeps every draft on legacy behavior when V2 is disabled", () => {
    const createdAt = new Date("2027-01-01T00:00:00.000Z");
    expect(gatePassIssueStockMode(createdAt, undefined, undefined)).toBe("legacy");
    expect(gatePassIssueStockMode(createdAt, "false", cutover)).toBe("legacy");
  });

  it("never changes an older draft, even when it is issued after cutover", () => {
    const oldDraftCreation = new Date("2026-10-01T00:00:00.000Z");
    expect(gatePassIssueStockMode(oldDraftCreation, "true", cutover)).toBe("legacy");
  });

  it("only enables V2 for drafts actually created at or after the UTC cutover", () => {
    expect(gatePassIssueStockMode(new Date("2026-10-31T23:59:59.999Z"), "true", cutover)).toBe("legacy");
    expect(gatePassIssueStockMode(new Date(cutover), "true", cutover)).toBe("v2");
    expect(gatePassIssueStockMode(new Date("2026-11-01T00:00:00.001Z"), "true", cutover)).toBe("v2");
  });

  it("fails closed if V2 is enabled without a valid explicit UTC cutover", () => {
    const draft = new Date("2026-11-02T00:00:00.000Z");
    for (const invalid of [undefined, "", "now", "2026-11-01", "2026-11-01T00:00:00Z",
      "2026-11-01T00:00:00.000+05:00", "2026-02-30T00:00:00.000Z"]) {
      expect(gatePassIssueStockMode(draft, "true", invalid)).toBe("misconfigured");
    }
    expect(gatePassIssueStockMode(new Date("invalid"), "true", cutover)).toBe("misconfigured");
  });
});
