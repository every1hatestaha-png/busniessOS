export type FbrSetupReadinessInput = {
  sellerIdentityReady: boolean;
  sandboxCredentialReady: boolean;
  sandboxConfigReady: boolean;
  referenceVerifiedProducts: number;
  annexureConfirmed: boolean;
  hsUomVerifiedProducts: number;
};

export type FbrSetupStep = {
  id: "seller" | "credential" | "sandbox" | "mapping";
  label: string;
  ready: boolean;
  detail: string;
};

export function buildFbrSetupReadiness(input: FbrSetupReadinessInput) {
  const steps: FbrSetupStep[] = [
    {
      id: "seller",
      label: "Seller identity",
      ready: input.sellerIdentityReady,
      detail: input.sellerIdentityReady
        ? "NTN, seller province and business address/city are available."
        : "Add NTN, seller province and business address/city in the business profile.",
    },
    {
      id: "credential",
      label: "Sandbox credential",
      ready: input.sandboxCredentialReady,
      detail: input.sandboxCredentialReady
        ? "A server-side FBR sandbox token is available for this workspace."
        : "Configure the workspace-scoped FBR sandbox token in the production environment.",
    },
    {
      id: "sandbox",
      label: "Sandbox scenario",
      ready: input.sandboxConfigReady,
      detail: input.sandboxConfigReady
        ? "Digital Invoicing sandbox is enabled with a test scenario."
        : "Enable the sandbox workflow and save the assigned SN### scenario.",
    },
    {
      id: "mapping",
      label: "Reference-verified product",
      ready: input.referenceVerifiedProducts > 0,
      detail: input.referenceVerifiedProducts > 0
        ? `${input.referenceVerifiedProducts} product(s) have current FBR reference verification.`
        : "Map and verify at least one product before preparing a sandbox invoice.",
    },
  ];
  const completed = steps.filter((step) => step.ready).length;

  return {
    steps,
    completed,
    total: steps.length,
    sandboxReady: completed === steps.length,
    productionHsUomReady: input.annexureConfirmed && input.hsUomVerifiedProducts > 0,
    productionHsUomDetail: input.annexureConfirmed
      ? input.hsUomVerifiedProducts > 0
        ? `${input.hsUomVerifiedProducts} product(s) have HS/UOM compatibility verified against the confirmed annexure.`
        : "Annexure is confirmed, but no product has been re-verified for HS/UOM compatibility yet."
      : "Production-only HS/UOM annexure confirmation is still pending.",
  };
}
