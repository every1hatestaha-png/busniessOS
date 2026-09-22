import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { assertFbrExpectedEnvironment, requiresFbrManualReconciliation, validateFbrInvoicePayload, type FbrEnvironment, type FbrInvoicePayload, type FbrValidationIssue } from "@/lib/fbr/digital-invoicing";
import { validateFbrProductionCompliance } from "@/lib/fbr/production-compliance";
import { validateFbrHsUomCompatibility, validateFbrLineMapping } from "@/lib/fbr/tax-mapping";
import { requirePermission } from "@/lib/server/authorization";
import { businessDateKey } from "@/lib/server/business-time";
import { db } from "@/lib/server/db";
import { writeAudit } from "@/lib/server/audit";
import { parseInvoiceIssuedSnapshot } from "@/lib/server/invoice-snapshot";

function money(value: number) {
  return Number(value.toFixed(2));
}

function normalizeTaxId(value: string | null | undefined) {
  const normalized = String(value ?? "").replace(/[-\s]/g, "");
  return normalized || undefined;
}

function normalizeRegistrationType(value: string | null): "Registered" | "Unregistered" {
  return value === "Registered" ? "Registered" : "Unregistered";
}

function submissionKey(workspaceId: string, invoiceId: string, environment: "SANDBOX" | "PRODUCTION") {
  return createHash("sha256").update(`fbr:${workspaceId}:${invoiceId}:${environment}:v1`).digest("hex");
}

export function fingerprintFbrPayload(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function getFbrSubmissionForInvoice(
  workspaceId: string,
  invoiceId: string,
  environment?: "SANDBOX" | "PRODUCTION",
) {
  return db.fbrInvoiceSubmission.findFirst({
    where: { workspaceId, invoiceId, ...(environment ? { environment } : {}) },
    orderBy: { updatedAt: "desc" },
    include: { attempts: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
}

export async function buildFbrInvoiceDraft(workspaceId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: {
      workspace: true,
      customer: true,
      salesOrder: {
        include: {
          items: {
            include: { product: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
        },
      },
    },
  });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "DRAFT") throw new Error("Draft invoices cannot be prepared for FBR until they are issued.");
  if (invoice.status === "CANCELLED") throw new Error("Cancelled invoices cannot be prepared for FBR.");
  if (!invoice.salesOrder) throw new Error("FBR submission requires a linked sales order.");
  if (!invoice.salesOrder.items.length) throw new Error("FBR submission requires at least one invoice item.");
  const issuedSnapshot = parseInvoiceIssuedSnapshot(invoice.issuedSnapshot);
  const sellerIdentity = issuedSnapshot?.seller ?? invoice.workspace;
  const buyerIdentity = issuedSnapshot?.buyer ?? invoice.customer;

  const config = await db.fbrIntegrationConfig.findUnique({ where: { workspaceId } });
  const environment = config?.environment ?? "SANDBOX";
  const preflight: FbrValidationIssue[] = [];

  if (!config?.enabled) {
    preflight.push({
      path: "integration.enabled",
      code: "INTEGRATION_DISABLED",
      message: "FBR Digital Invoicing is not enabled for this workspace.",
    });
  }
  if (!sellerIdentity.province?.trim()) {
    preflight.push({
      path: "sellerProvince",
      code: "MISSING_MASTER_DATA",
      message: "Add the seller province in business settings.",
    });
  }
  if (!buyerIdentity.registrationType || !["Registered", "Unregistered"].includes(buyerIdentity.registrationType)) {
    preflight.push({
      path: "buyerRegistrationType",
      code: "MISSING_MASTER_DATA",
      message: "Set the buyer FBR registration type.",
    });
  }
  if (environment === "SANDBOX" && !config?.defaultScenarioId?.trim()) {
    preflight.push({
      path: "scenarioId",
      code: "MISSING_MASTER_DATA",
      message: "Choose an FBR sandbox scenario before validation.",
    });
  }

  const subtotal = Number(invoice.salesOrder.subtotal);
  const discount = Number(invoice.salesOrder.discount);
  const taxableAmount = Math.max(0, subtotal - discount);
  const invoiceTotal = Number(invoice.amount);
  const gstAmount = Math.max(0, invoiceTotal - taxableAmount);
  const invoiceDate = businessDateKey(invoice.issuedAt, sellerIdentity.timezone || "Asia/Karachi");
  let taxMappingReady = true;
  let hsUomCompatibilityReady = true;

  const lineDrafts = invoice.salesOrder.items.map((item, index) => {
    const quantity = Number(item.quantity);
    const gross = money(quantity * Number(item.unitPrice));
    const storedTaxable = item.taxableAmount?.toNumber();
    const storedTax = item.salesTaxAmount?.toNumber();
    const storedTaxRate = item.taxRate?.toNumber();
    const taxable = storedTaxable ?? 0;
    const salesTax = storedTax ?? 0;
    const lineDiscount = money(gross - taxable);

    const mappingIssues = validateFbrLineMapping({
      invoiceDate,
      sellerProvince: sellerIdentity.province ?? "",
      hsCode: item.fbrHsCode,
      uom: item.fbrUom,
      uomId: item.fbrUomId,
      transactionTypeId: item.fbrTransactionTypeId,
      saleType: item.fbrSaleType,
      rateId: item.fbrRateId,
      rateDesc: item.fbrRateDesc,
      rateValue: item.fbrRateValue?.toNumber(),
      referenceVerifiedAt: item.fbrReferenceVerifiedAt,
      referenceVerifiedForDate: item.fbrReferenceVerifiedForDate,
      referenceProvinceCode: item.fbrReferenceProvinceCode,
      referenceProvinceDesc: item.fbrReferenceProvinceDesc,
      taxRate: storedTaxRate,
      taxableAmount: storedTaxable,
      salesTaxAmount: storedTax,
    });
    if (mappingIssues.length) {
      taxMappingReady = false;
      preflight.push(...mappingIssues.map((issue) => ({
        path: `items[${index}]`,
        code: issue.code,
        message: `${item.productName ?? item.product.name}: ${issue.message}`,
      })));
    }

    if (environment === "PRODUCTION") {
      const compatibility = validateFbrHsUomCompatibility({
        configuredAnnexureId: config?.hsUomAnnexureId,
        annexureConfirmedAt: config?.hsUomAnnexureConfirmedAt,
        annexureConfirmedBy: config?.hsUomAnnexureConfirmedBy,
        lineAnnexureId: item.fbrHsUomAnnexureId,
        lineVerifiedAt: item.fbrHsUomVerifiedAt,
      });
      if (!compatibility.ready) {
        hsUomCompatibilityReady = false;
        preflight.push({
          path: `items[${index}].uoM`,
          code: compatibility.code,
          message: `${item.productName ?? item.product.name}: ${compatibility.message}`,
        });
      }
    }

    if (lineDiscount < -0.01) {
      taxMappingReady = false;
      preflight.push({
        path: `items[${index}].discount`,
        code: "FBR_LINE_DISCOUNT_MISMATCH",
        message: `${item.productName ?? item.product.name}: stored taxable value exceeds the line gross value.`,
      });
    }

    return {
      item,
      quantity,
      gross,
      taxable,
      salesTax,
      lineDiscount: Math.max(0, lineDiscount),
    };
  });

  const taxableFromLines = lineDrafts.reduce((sum, line) => sum + line.taxable, 0);
  if (Math.abs(money(taxableFromLines) - money(taxableAmount)) > 0.01) {
    preflight.push({
      path: "items[].taxableAmount",
      code: "TAXABLE_TOTAL_MISMATCH",
      message: "Stored sale-line taxable values do not reconcile to the invoice taxable amount.",
    });
  }

  const items = lineDrafts.map((line) => ({
    hsCode: line.item.fbrHsCode ?? "",
    productDescription: line.item.productName ?? line.item.product.name,
    rate: line.item.fbrRateDesc ?? "",
    uoM: line.item.fbrUom ?? "",
    quantity: line.quantity,
    totalValues: money(line.taxable + line.salesTax),
    valueSalesExcludingST: money(line.taxable),
    fixedNotifiedValueOrRetailPrice: 0,
    salesTaxApplicable: money(line.salesTax),
    salesTaxWithheldAtSource: 0,
    extraTax: 0,
    furtherTax: 0,
    sroScheduleNo: "",
    fedPayable: 0,
    discount: money(line.lineDiscount),
    saleType: line.item.fbrSaleType ?? "",
    sroItemSerialNo: "",
  }));

  const reconciledTax = items.reduce((sum, item) => sum + item.salesTaxApplicable, 0);
  const reconciledTotal = items.reduce((sum, item) => sum + item.totalValues, 0);
  if (Math.abs(money(reconciledTax) - money(gstAmount)) > 0.01) {
    preflight.push({
      path: "items[].salesTaxApplicable",
      code: "GST_TOTAL_MISMATCH",
      message: "Stored sale-line sales tax does not reconcile to the invoice GST amount.",
    });
  }
  if (Math.abs(money(reconciledTotal) - money(invoiceTotal)) > 0.01) {
    preflight.push({
      path: "items[].totalValues",
      code: "INVOICE_TOTAL_MISMATCH",
      message: "FBR line totals do not reconcile to the stored invoice total.",
    });
  }

  if (environment === "PRODUCTION") {
    preflight.push(...validateFbrProductionCompliance({
      provider: config?.provider,
      integratorName: config?.integratorName,
      integratorLicenseNo: config?.integratorLicenseNo,
      softwareRegistrationNo: config?.softwareRegistrationNo,
      productionApprovedAt: config?.productionApprovedAt,
      productionApprovedBy: config?.productionApprovedBy,
      productionApprovalReference: config?.productionApprovalReference,
      taxMappingReady,
      hsUomCompatibilityReady,
    }));
  }

  const payload: FbrInvoicePayload = {
    invoiceType: "Sale Invoice",
    invoiceDate,
    sellerNTNCNIC: normalizeTaxId(sellerIdentity.ntn) ?? "",
    sellerBusinessName: sellerIdentity.name,
    sellerProvince: sellerIdentity.province ?? "",
    sellerAddress: sellerIdentity.address ?? sellerIdentity.city ?? "",
    buyerNTNCNIC: normalizeTaxId(buyerIdentity.taxId),
    buyerBusinessName: buyerIdentity.companyName ?? buyerIdentity.name,
    buyerProvince: buyerIdentity.province ?? "",
    buyerAddress: buyerIdentity.address ?? buyerIdentity.city ?? "",
    buyerRegistrationType: normalizeRegistrationType(buyerIdentity.registrationType),
    invoiceRefNo: "",
    ...(environment === "SANDBOX" ? { scenarioId: config?.defaultScenarioId ?? "" } : {}),
    items,
  };

  const issues = [...preflight, ...validateFbrInvoicePayload(payload, environment)];
  return {
    invoice,
    config,
    environment,
    payload,
    issues,
    readyForRemoteValidation: issues.length === 0,
    fingerprint: fingerprintFbrPayload(payload),
  };
}

export async function checkFbrSubmissionFreshness(input: {
  workspaceId: string;
  invoiceId: string;
  environment: "SANDBOX" | "PRODUCTION";
  payloadSnapshot: Prisma.JsonValue | null;
}) {
  if (!input.payloadSnapshot) {
    return {
      fresh: false as const,
      code: "PAYLOAD_MISSING",
      message: "The stored FBR payload snapshot is missing.",
    };
  }

  const current = await buildFbrInvoiceDraft(input.workspaceId, input.invoiceId);
  if (current.environment !== input.environment) {
    return {
      fresh: false as const,
      code: "ENVIRONMENT_CHANGED",
      message: "The FBR environment changed after this payload was prepared. Prepare a new submission.",
    };
  }
  if (current.issues.length) {
    return {
      fresh: false as const,
      code: "PREFLIGHT_CHANGED",
      message: current.issues[0]?.message ?? "FBR preflight no longer passes.",
    };
  }

  const storedFingerprint = fingerprintFbrPayload(input.payloadSnapshot);
  if (storedFingerprint !== current.fingerprint) {
    return {
      fresh: false as const,
      code: "PAYLOAD_STALE",
      message: "Invoice or FBR master data changed after this payload was prepared. Prepare and validate a fresh snapshot.",
    };
  }

  return { fresh: true as const, current };
}

export async function prepareFbrInvoiceSubmission(invoiceId: string, expectedEnvironment?: FbrEnvironment) {
  const context = await requirePermission("financial.manage");
  const draft = await buildFbrInvoiceDraft(context.workspaceId, invoiceId);
  const { invoice, environment, payload, issues } = draft;
  assertFbrExpectedEnvironment(environment, expectedEnvironment);
  const status = issues.length ? "BLOCKED" : "DRAFT";
  const idempotencyKey = submissionKey(context.workspaceId, invoice.id, environment);

  const submission = await db.$transaction(async (tx) => {
    const existing = await tx.fbrInvoiceSubmission.findFirst({
      where: { workspaceId: context.workspaceId, invoiceId: invoice.id, environment },
    });
    if (existing?.status === "SUBMITTED") return existing;
    if (existing && requiresFbrManualReconciliation(existing.status, existing.lastErrorCode)) {
      return existing;
    }

    const data = {
      environment,
      status,
      idempotencyKey,
      payloadSnapshot: payload as unknown as Prisma.InputJsonValue,
      validationResponse: issues as unknown as Prisma.InputJsonValue,
      submissionResponse: Prisma.DbNull,
      fbrInvoiceNumber: null,
      validatedAt: null,
      submittedAt: null,
      lastErrorCode: issues[0]?.code ?? null,
      lastErrorMessage: issues[0]?.message ?? null,
    } satisfies Prisma.FbrInvoiceSubmissionUpdateInput;

    const saved = existing
      ? await tx.fbrInvoiceSubmission.update({
          where: { id: existing.id },
          data,
        })
      : await tx.fbrInvoiceSubmission.create({
          data: {
            workspaceId: context.workspaceId,
            invoiceId: invoice.id,
            ...data,
          },
        });

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.user.id,
      action: "fbr.submission_prepared",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: {
        submissionId: saved.id,
        environment,
        issueCount: issues.length,
        readyForRemoteValidation: issues.length === 0,
        payloadFingerprint: draft.fingerprint,
      },
    });
    return saved;
  });

  return {
    submission,
    payload,
    issues,
    readyForRemoteValidation: issues.length === 0,
    fingerprint: draft.fingerprint,
  };
}

export async function recordFbrAttempt(input: {
  submissionId: string;
  kind: "VALIDATE" | "POST";
  requestBody?: Prisma.InputJsonValue;
  responseBody?: Prisma.InputJsonValue;
  httpStatus?: number;
  succeeded: boolean;
  errorCode?: string;
  errorMessage?: string;
}) {
  const context = await requirePermission("financial.manage");
  return db.$transaction(async (tx) => {
    const submission = await tx.fbrInvoiceSubmission.findFirst({
      where: { id: input.submissionId, workspaceId: context.workspaceId },
    });
    if (!submission) throw new Error("FBR submission not found.");

    const attempt = await tx.fbrInvoiceAttempt.create({
      data: {
        id: randomUUID(),
        submissionId: submission.id,
        kind: input.kind,
        requestBody: input.requestBody,
        responseBody: input.responseBody,
        httpStatus: input.httpStatus,
        succeeded: input.succeeded,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      },
    });

    await tx.fbrInvoiceSubmission.update({
      where: { id: submission.id },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        lastErrorCode: input.succeeded ? null : input.errorCode ?? "REMOTE_ERROR",
        lastErrorMessage: input.succeeded ? null : input.errorMessage ?? "FBR request failed.",
      },
    });

    return attempt;
  });
}
