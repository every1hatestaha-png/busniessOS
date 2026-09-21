export type FbrProductionComplianceInput = {
  provider?: string | null;
  integratorName?: string | null;
  integratorLicenseNo?: string | null;
  softwareRegistrationNo?: string | null;
  productionApprovedAt?: Date | null;
  productionApprovedBy?: string | null;
  productionApprovalReference?: string | null;
  taxMappingReady?: boolean;
  hsUomCompatibilityReady?: boolean;
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

  if (!input.softwareRegistrationNo?.trim()) {
    issues.push({
      path: "integration.softwareRegistrationNo",
      code: "FBR_SOFTWARE_REGISTRATION_REQUIRED",
      message: "Production transmission is blocked until the FBR-verifiable electronic invoicing software registration number is recorded.",
    });
  }

  if (!input.productionApprovedAt || !input.productionApprovedBy?.trim()) {
    issues.push({
      path: "integration.productionApproval",
      code: "PRODUCTION_APPROVAL_REQUIRED",
      message: "Production transmission is blocked until an authorized workspace user confirms the licensed-integrator setup.",
    });
  }

  if (!input.productionApprovalReference?.trim()) {
    issues.push({
      path: "integration.productionApprovalReference",
      code: "PRODUCTION_APPROVAL_REFERENCE_REQUIRED",
      message: "Production transmission is blocked until the FBR, PRAL, or licensed-integrator onboarding or approval reference is recorded.",
    });
  }

  if (!input.taxMappingReady) {
    issues.push({
      path: "items[].saleType",
      code: "PRODUCTION_TAX_MAPPING_NOT_READY",
      message: "Production transmission remains blocked until every invoice line has an immutable, reference-verified FBR sale type and rate that reconciles to the stored tax calculation.",
    });
  }

  if (!input.hsUomCompatibilityReady) {
    issues.push({
      path: "items[].uoM",
      code: "PRODUCTION_HS_UOM_COMPATIBILITY_NOT_READY",
      message: "Production transmission remains blocked until each HS code and UOM combination is verified through the FBR HS_UOM reference rule using a confirmed sales-annexure mapping.",
    });
  }

  return issues;
}
