import { describe, expect, it } from "vitest";

import { fbrRemoteUiBlock, requiresFbrManualReconciliation } from "@/lib/fbr/control-plane";

describe("FBR invoice UI remote-operation guard", () => {
  it("allows remote operations only in sandbox", () => {
    expect(fbrRemoteUiBlock("SANDBOX", "VALIDATE")).toBeNull();
    expect(fbrRemoteUiBlock("SANDBOX", "SUBMIT")).toBeNull();
  });

  it("keeps production validation and submission locked", () => {
    expect(fbrRemoteUiBlock("PRODUCTION", "VALIDATE")).toEqual(expect.objectContaining({
      code: "PRODUCTION_UI_LOCKED",
    }));
    expect(fbrRemoteUiBlock("PRODUCTION", "SUBMIT")).toEqual(expect.objectContaining({
      code: "PRODUCTION_UI_LOCKED",
    }));
  });
});


describe("FBR manual reconciliation guard", () => {
  it("preserves ambiguous POST outcomes as non-retryable", () => {
    expect(requiresFbrManualReconciliation("BLOCKED", "AMBIGUOUS_POST_RESULT")).toBe(true);
    expect(requiresFbrManualReconciliation("BLOCKED", "UNAUTHORIZED")).toBe(false);
    expect(requiresFbrManualReconciliation("FAILED", "AMBIGUOUS_POST_RESULT")).toBe(false);
  });
});
