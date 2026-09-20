import { describe, expect, it } from "vitest";

import { buildFbrSetupReadiness } from "@/lib/fbr/setup-readiness";

describe("FBR setup readiness", () => {
  it("requires all sandbox prerequisites independently of production HS/UOM approval", () => {
    const readiness = buildFbrSetupReadiness({
      sellerIdentityReady: true,
      sandboxCredentialReady: true,
      sandboxConfigReady: true,
      referenceVerifiedProducts: 2,
      annexureConfirmed: false,
      hsUomVerifiedProducts: 0,
    });
    expect(readiness.sandboxReady).toBe(true);
    expect(readiness.completed).toBe(4);
    expect(readiness.productionHsUomReady).toBe(false);
  });

  it("identifies missing sandbox setup and accepts production HS/UOM only with both confirmation and verified products", () => {
    const incomplete = buildFbrSetupReadiness({
      sellerIdentityReady: false,
      sandboxCredentialReady: false,
      sandboxConfigReady: false,
      referenceVerifiedProducts: 0,
      annexureConfirmed: true,
      hsUomVerifiedProducts: 0,
    });
    expect(incomplete.sandboxReady).toBe(false);
    expect(incomplete.completed).toBe(0);
    expect(incomplete.steps.every((step) => !step.ready)).toBe(true);
    expect(incomplete.productionHsUomReady).toBe(false);

    const productionReady = buildFbrSetupReadiness({
      sellerIdentityReady: false,
      sandboxCredentialReady: false,
      sandboxConfigReady: false,
      referenceVerifiedProducts: 0,
      annexureConfirmed: true,
      hsUomVerifiedProducts: 1,
    });
    expect(productionReady.productionHsUomReady).toBe(true);
  });
});
