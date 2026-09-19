import { plainPercentageRate } from "@/lib/fbr/reference";

export const FBR_STANDARD_RATE_SALE_TYPE = "Goods at standard rate (default)";

export type FbrLineMappingInput = {
  invoiceDate: string;
  sellerProvince: string;
  hsCode: string | null | undefined;
  uom: string | null | undefined;
  uomId: number | null | undefined;
  transactionTypeId: number | null | undefined;
  saleType: string | null | undefined;
  rateId: number | null | undefined;
  rateDesc: string | null | undefined;
  rateValue: number | null | undefined;
  referenceVerifiedAt: Date | null | undefined;
  referenceVerifiedForDate: Date | null | undefined;
  referenceProvinceCode: number | null | undefined;
  referenceProvinceDesc: string | null | undefined;
  taxRate: number | null | undefined;
  taxableAmount: number | null | undefined;
  salesTaxAmount: number | null | undefined;
};

export type FbrLineMappingIssue = {
  code: string;
  message: string;
};

function dateKey(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function normalized(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function near(left: number, right: number, tolerance = 0.0001) {
  return Math.abs(left - right) <= tolerance;
}

export function validateFbrLineMapping(input: FbrLineMappingInput): FbrLineMappingIssue[] {
  const issues: FbrLineMappingIssue[] = [];
  const missing = [
    !input.hsCode?.trim() && "HS code",
    !input.uom?.trim() && "UOM",
    !input.uomId && "UOM reference ID",
    !input.transactionTypeId && "transaction type ID",
    !input.saleType?.trim() && "sale type",
    !input.rateId && "rate ID",
    !input.rateDesc?.trim() && "rate description",
    input.rateValue == null && "rate value",
    !input.referenceVerifiedAt && "reference verification timestamp",
    !input.referenceVerifiedForDate && "reference effective date",
    !input.referenceProvinceCode && "reference province code",
    !input.referenceProvinceDesc?.trim() && "reference province",
    input.taxRate == null && "line tax rate",
    input.taxableAmount == null && "line taxable amount",
    input.salesTaxAmount == null && "line sales-tax amount",
  ].filter(Boolean);

  if (missing.length) {
    issues.push({
      code: "FBR_LINE_MAPPING_INCOMPLETE",
      message: `FBR line mapping is incomplete: ${missing.join(", ")}.`,
    });
    return issues;
  }

  if (dateKey(input.referenceVerifiedForDate) !== input.invoiceDate) {
    issues.push({
      code: "FBR_RATE_VERIFICATION_DATE_MISMATCH",
      message: "The FBR rate was not verified for this invoice date. Re-verify the product mapping for the business date before fiscal submission.",
    });
  }

  if (normalized(input.referenceProvinceDesc) !== normalized(input.sellerProvince)) {
    issues.push({
      code: "FBR_MAPPING_PROVINCE_MISMATCH",
      message: "The FBR rate was verified for a different seller province.",
    });
  }

  if (input.saleType!.trim() !== FBR_STANDARD_RATE_SALE_TYPE) {
    issues.push({
      code: "UNSUPPORTED_FBR_SALE_TYPE",
      message: `Sale type "${input.saleType}" is reference-verified but is not yet supported by MunshiOS production tax calculation.`,
    });
  }

  if (!plainPercentageRate(input.rateDesc!, input.rateValue!)) {
    issues.push({
      code: "UNSUPPORTED_COMPOUND_FBR_RATE",
      message: `FBR rate "${input.rateDesc}" is not a plain percentage rate and requires a dedicated tax formula before submission.`,
    });
  }

  if (!near(input.taxRate!, input.rateValue!)) {
    issues.push({
      code: "FBR_RATE_VALUE_MISMATCH",
      message: "The stored sale-line tax rate does not match the verified FBR rate value.",
    });
  }

  const expectedTax = Number((input.taxableAmount! * input.rateValue! / 100).toFixed(2));
  if (!near(expectedTax, input.salesTaxAmount!, 0.01)) {
    issues.push({
      code: "FBR_LINE_TAX_MISMATCH",
      message: "The stored sale-line tax amount does not reconcile to the verified FBR percentage rate.",
    });
  }

  return issues;
}


export function validateFbrHsUomCompatibility(input: {
  configuredAnnexureId: number | null | undefined;
  annexureConfirmedAt: Date | null | undefined;
  annexureConfirmedBy: string | null | undefined;
  lineAnnexureId: number | null | undefined;
  lineVerifiedAt: Date | null | undefined;
}) {
  if (!input.configuredAnnexureId || !input.annexureConfirmedAt || !input.annexureConfirmedBy?.trim()) {
    return {
      ready: false as const,
      code: "FBR_HS_UOM_ANNEXURE_NOT_CONFIRMED",
      message: "The FBR HS/UOM sales-annexure ID has not been explicitly confirmed for this workspace.",
    };
  }
  if (!input.lineVerifiedAt || !input.lineAnnexureId) {
    return {
      ready: false as const,
      code: "FBR_HS_UOM_UNVERIFIED",
      message: "This sale line does not have an immutable FBR HS-code/UOM compatibility verification snapshot.",
    };
  }
  if (input.lineAnnexureId !== input.configuredAnnexureId) {
    return {
      ready: false as const,
      code: "FBR_HS_UOM_ANNEXURE_MISMATCH",
      message: "This sale line was verified against a different FBR sales-annexure ID.",
    };
  }
  return { ready: true as const };
}
