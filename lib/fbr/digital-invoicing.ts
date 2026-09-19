export type FbrEnvironment = "SANDBOX" | "PRODUCTION";

export type FbrInvoiceItemPayload = {
  hsCode: string;
  productDescription: string;
  rate: string;
  uoM: string;
  quantity: number;
  totalValues: number;
  valueSalesExcludingST: number;
  fixedNotifiedValueOrRetailPrice: number;
  salesTaxApplicable: number;
  salesTaxWithheldAtSource: number;
  extraTax?: number;
  furtherTax?: number;
  sroScheduleNo?: string;
  fedPayable?: number;
  discount?: number;
  saleType: string;
  sroItemSerialNo?: string;
};

export type FbrInvoicePayload = {
  invoiceType: "Sale Invoice" | "Debit Note";
  invoiceDate: string;
  sellerNTNCNIC: string;
  sellerBusinessName: string;
  sellerProvince: string;
  sellerAddress: string;
  buyerNTNCNIC?: string;
  buyerBusinessName: string;
  buyerProvince: string;
  buyerAddress: string;
  buyerRegistrationType: "Registered" | "Unregistered";
  invoiceRefNo?: string;
  scenarioId?: string;
  items: FbrInvoiceItemPayload[];
};

export type FbrValidationIssue = {
  path: string;
  code: string;
  message: string;
};

function isNonEmpty(value: string | undefined | null) {
  return Boolean(value?.trim());
}

function isFiniteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function isFinitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function validateTaxIdentity(value: string | undefined) {
  if (!value) return false;
  const normalized = value.replace(/[-\s]/g, "");
  return /^\d{7}$/.test(normalized) || /^\d{13}$/.test(normalized);
}

export function validateFbrInvoicePayload(
  payload: FbrInvoicePayload,
  environment: FbrEnvironment,
): FbrValidationIssue[] {
  const issues: FbrValidationIssue[] = [];
  const required = (path: string, value: string | undefined | null) => {
    if (!isNonEmpty(value)) issues.push({ path, code: "REQUIRED", message: `${path} is required.` });
  };

  required("invoiceDate", payload.invoiceDate);
  required("sellerNTNCNIC", payload.sellerNTNCNIC);
  required("sellerBusinessName", payload.sellerBusinessName);
  required("sellerProvince", payload.sellerProvince);
  required("sellerAddress", payload.sellerAddress);
  required("buyerBusinessName", payload.buyerBusinessName);
  required("buyerProvince", payload.buyerProvince);
  required("buyerAddress", payload.buyerAddress);

  if (!validateTaxIdentity(payload.sellerNTNCNIC)) {
    issues.push({ path: "sellerNTNCNIC", code: "INVALID_TAX_ID", message: "Seller NTN/CNIC must be a 7-digit NTN or 13-digit CNIC." });
  }

  if (payload.buyerRegistrationType === "Registered") {
    required("buyerNTNCNIC", payload.buyerNTNCNIC);
    if (payload.buyerNTNCNIC && !validateTaxIdentity(payload.buyerNTNCNIC)) {
      issues.push({ path: "buyerNTNCNIC", code: "INVALID_TAX_ID", message: "Registered buyer NTN/CNIC must be a 7-digit NTN or 13-digit CNIC." });
    }
  }

  if (payload.invoiceType === "Debit Note") required("invoiceRefNo", payload.invoiceRefNo);
  if (environment === "SANDBOX") required("scenarioId", payload.scenarioId);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.invoiceDate)) {
    issues.push({ path: "invoiceDate", code: "INVALID_DATE", message: "Invoice date must use YYYY-MM-DD." });
  }

  if (!payload.items.length) {
    issues.push({ path: "items", code: "EMPTY_ITEMS", message: "At least one invoice item is required." });
    return issues;
  }

  payload.items.forEach((item, index) => {
    const prefix = `items[${index}]`;
    required(`${prefix}.hsCode`, item.hsCode);
    required(`${prefix}.productDescription`, item.productDescription);
    required(`${prefix}.rate`, item.rate);
    required(`${prefix}.uoM`, item.uoM);
    required(`${prefix}.saleType`, item.saleType);

    if (!isFinitePositive(item.quantity)) {
      issues.push({ path: `${prefix}.quantity`, code: "INVALID_QUANTITY", message: "Quantity must be greater than zero." });
    }

    const moneyFields: Array<[keyof FbrInvoiceItemPayload, number | undefined]> = [
      ["totalValues", item.totalValues],
      ["valueSalesExcludingST", item.valueSalesExcludingST],
      ["fixedNotifiedValueOrRetailPrice", item.fixedNotifiedValueOrRetailPrice],
      ["salesTaxApplicable", item.salesTaxApplicable],
      ["salesTaxWithheldAtSource", item.salesTaxWithheldAtSource],
      ["extraTax", item.extraTax],
      ["furtherTax", item.furtherTax],
      ["fedPayable", item.fedPayable],
      ["discount", item.discount],
    ];

    for (const [field, value] of moneyFields) {
      if (value !== undefined && !isFiniteNonNegative(value)) {
        issues.push({ path: `${prefix}.${String(field)}`, code: "INVALID_AMOUNT", message: `${String(field)} must be a non-negative finite number.` });
      }
    }
  });

  return issues;
}

export function fbrEndpoint(environment: FbrEnvironment, kind: "VALIDATE" | "POST") {
  const suffix = environment === "SANDBOX" ? "_sb" : "";
  const method = kind === "VALIDATE" ? "validateinvoicedata" : "postinvoicedata";
  return `https://gw.fbr.gov.pk/di_data/v1/di/${method}${suffix}`;
}
