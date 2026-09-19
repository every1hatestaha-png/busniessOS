export type FbrProductionComplianceInput = {
  provider?: string | null;
  integratorName?: string | null;
  integratorLicenseNo?: string | null;
  productionApprovedAt?: Date | null;
  productionApprovedBy?: string | null;
  taxMappingReady?: boolean;
};

export type FbrComplianceIssue = {
  path: string;
  code: string;
  message: string;
};

export function validateFbrProductionCompliance(input: FbrProductionComplianceInput): FbrComplianceIssue[] {
  const issues: FbrComplianceIssue[] = [];
  const provider = input.provider?.trim().toUpperCase();

  if (!input.integratorName?.trim()) {
    issues.push({
      path: "integration.integratorName",
      code: "LICENSED_INTEGRATOR_REQUIRED",
      message: "Production FBR transmission requires a configured licensed integrator or PRAL onboarding route.",
    });
  }

  if (provider && provider !== "PRAL" && !input.integratorLicenseNo?.trim()) {
    issues.push({
      path: "integration.integratorLicenseNo",
      code: "LICENSE_REFERENCE_REQUIRED",
      message: "Record the licensed integrator reference before enabling production transmission.",
    });
  }

  if (!input.productionApprovedAt || !input.productionApprovedBy?.trim()) {
    issues.push({
      path: "integration.productionApproval",
      code: "PRODUCTION_APPROVAL_REQUIRED",
      message: "Production transmission is blocked until an authorized workspace user confirms the licensed-integrator setup.",
    });
  }

  if (!input.taxMappingReady) {
    issues.push({
      path: "items[].saleType",
      code: "PRODUCTION_TAX_MAPPING_NOT_READY",
      message: "Production transmission remains blocked until per-item FBR sale type and rate mapping is implemented and validated with the licensed integrator or PRAL.",
    });
  }

  return issues;
}
