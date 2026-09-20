import { describe, expect, it } from "vitest";
import { validateFbrProductionCompliance } from "@/lib/fbr/production-compliance";

describe("FBR production compliance gate", () => {
  it("allows an explicitly approved PRAL route only when item tax mapping is ready", () => {
    expect(validateFbrProductionCompliance({
      provider: "PRAL",
      integratorName: "PRAL",
      softwareRegistrationNo: "SW-REG-001",
      productionApprovedAt: new Date("2026-09-19T00:00:00.000Z"),
      productionApprovedBy: "user_123",
      taxMappingReady: true,
      hsUomCompatibilityReady: true,
    })).toEqual([]);
  });

  it("blocks production while per-item sale type and rate mapping is not ready", () => {
    expect(validateFbrProductionCompliance({
      provider: "PRAL",
      integratorName: "PRAL",
      softwareRegistrationNo: "SW-REG-001",
      productionApprovedAt: new Date("2026-09-19T00:00:00.000Z"),
      productionApprovedBy: "user_123",
      hsUomCompatibilityReady: true,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PRODUCTION_TAX_MAPPING_NOT_READY" }),
    ]));
  });

  it("blocks production when no licensed-integrator route is configured", () => {
    expect(validateFbrProductionCompliance({
      provider: "PRAL",
      productionApprovedAt: new Date("2026-09-19T00:00:00.000Z"),
      productionApprovedBy: "user_123",
      taxMappingReady: true,
      hsUomCompatibilityReady: true,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LICENSED_INTEGRATOR_REQUIRED" }),
    ]));
  });

  it("requires a license reference for non-PRAL integrators", () => {
    expect(validateFbrProductionCompliance({
      provider: "THIRD_PARTY",
      integratorName: "Example Integrator",
      productionApprovedAt: new Date("2026-09-19T00:00:00.000Z"),
      productionApprovedBy: "user_123",
      taxMappingReady: true,
      hsUomCompatibilityReady: true,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LICENSE_REFERENCE_REQUIRED" }),
    ]));
  });

  it("requires explicit production approval even with a configured integrator", () => {
    expect(validateFbrProductionCompliance({
      provider: "PRAL",
      integratorName: "PRAL",
      softwareRegistrationNo: "SW-REG-001",
      taxMappingReady: true,
      hsUomCompatibilityReady: true,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PRODUCTION_APPROVAL_REQUIRED" }),
    ]));
  });

  it("requires the FBR-verifiable software registration number", () => {
    expect(validateFbrProductionCompliance({
      provider: "PRAL",
      integratorName: "PRAL",
      productionApprovedAt: new Date("2026-09-19T00:00:00.000Z"),
      productionApprovedBy: "user_123",
      taxMappingReady: true,
      hsUomCompatibilityReady: true,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "FBR_SOFTWARE_REGISTRATION_REQUIRED" }),
    ]));
  });

  it("blocks production while HS-code and UOM compatibility remains unverified", () => {
    expect(validateFbrProductionCompliance({
      provider: "PRAL",
      integratorName: "PRAL",
      softwareRegistrationNo: "SW-REG-001",
      productionApprovedAt: new Date("2026-09-19T00:00:00.000Z"),
      productionApprovedBy: "user_123",
      taxMappingReady: true,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PRODUCTION_HS_UOM_COMPATIBILITY_NOT_READY" }),
    ]));
  });

  it("allows an approved non-PRAL route with a recorded license reference when item tax mapping is ready", () => {
    expect(validateFbrProductionCompliance({
      provider: "THIRD_PARTY",
      integratorName: "Licensed Integrator Pvt Ltd",
      integratorLicenseNo: "LI-REFERENCE-001",
      softwareRegistrationNo: "SW-REG-001",
      productionApprovedAt: new Date("2026-09-19T00:00:00.000Z"),
      productionApprovedBy: "user_123",
      taxMappingReady: true,
      hsUomCompatibilityReady: true,
    })).toEqual([]);
  });
});
