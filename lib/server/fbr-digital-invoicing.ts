import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { validateFbrInvoicePayload, type FbrInvoicePayload, type FbrValidationIssue } from "@/lib/fbr/digital-invoicing";
import { validateFbrProductionCompliance } from "@/lib/fbr/production-compliance";
import { requiresFbrManualReconciliation } from "@/lib/fbr/control-plane";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { writeAudit } from "@/lib/server/audit";

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
  if (!invoice.workspace.province?.trim()) {
    preflight.push({
      path: "sellerProvince",
      code: "MISSING_MASTER_DATA",
      message: "Add the seller province in business settings.",
    });
  }
  if (!invoice.customer.registrationType || !["Registered", "Unregistered"].includes(invoice.customer.registrationType)) {
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

  if (environment === "PRODUCTION") {
    preflight.push(...validateFbrProductionCompliance({
      provider: config?.provider,
      integratorName: config?.integratorName,
      integratorLicenseNo: config?.integratorLicenseNo,
      productionApprovedAt: config?.productionApprovedAt,
      productionApprovedBy: config?.productionApprovedBy,
      // Keep this false until MunshiOS stores and validates FBR sale type/rate per line item.
      taxMappingReady: false,
    }));
  }

  const subtotal = Number(invoice.salesOrder.subtotal);
  const discount = Number(invoice.salesOrder.discount);
  const taxableAmount = Math.max(0, subtotal - discount);
  const invoiceTotal = Number(invoice.amount);
  const gstAmount = Math.max(0, invoiceTotal - taxableAmount);
  const gstRate = taxableAmount > 0 ? (gstAmount / taxableAmount) * 100 : 0;

  if (!(gstRate > 0)) {
    preflight.push({
      path: "items[].rate",
      code: "UNSUPPORTED_TAX_MAPPING",
      message: "This foundation currently requires a positive standard sales-tax rate. Zero-rated/exempt/SRO scenarios need explicit FBR mapping.",
    });
  }

  const lineDrafts = invoice.salesOrder.items.map((item, index) => {
    if (!item.product.fbrHsCode?.trim()) {
      preflight.push({
        path: `items[${index}].hsCode`,
        code: "MISSING_MASTER_DATA",
        message: `Add an FBR HS code to ${item.product.name}.`,
      });
    }
    if (!item.product.fbrUom?.trim()) {
      preflight.push({
        path: `items[${index}].uoM`,
        code: "MISSING_MASTER_DATA",
        message: `Add an FBR unit of measurement to ${item.product.name}.`,
      });
    }

    const quantity = Number(item.quantity);
    const gross = quantity * Number(item.unitPrice);
    const lineDiscount = quantity * Number(item.discountPerUnit);
    const valueSalesExcludingST = Math.max(0, gross - lineDiscount);
    return { item, quantity, lineDiscount, valueSalesExcludingST };
  });

  const taxableFromLines = lineDrafts.reduce((sum, line) => sum + line.valueSalesExcludingST, 0);
  if (Math.abs(money(taxableFromLines) - money(taxableAmount)) > 0.01) {
    preflight.push({
      path: "items",
      code: "TAXABLE_TOTAL_MISMATCH",
      message: "Invoice line taxable values do not reconcile to the stored invoice taxable amount.",
    });
  }

  let allocatedTax = 0;
  const items = lineDrafts.map((line, index) => {
    const isLast = index === lineDrafts.length - 1;
    const proportionalTax = line.valueSalesExcludingST * (gstRate / 100);
    const lineTax = isLast ? money(gstAmount - allocatedTax) : money(proportionalTax);
    allocatedTax = money(allocatedTax + lineTax);

    return {
      hsCode: line.item.product.fbrHsCode ?? "",
      productDescription: line.item.productName ?? line.item.product.name,
      rate: `${Number(gstRate.toFixed(4))}%`,
      uoM: line.item.product.fbrUom ?? "",
      quantity: line.quantity,
      totalValues: money(line.valueSalesExcludingST + lineTax),
      valueSalesExcludingST: money(line.valueSalesExcludingST),
      fixedNotifiedValueOrRetailPrice: 0,
      salesTaxApplicable: lineTax,
      salesTaxWithheldAtSource: 0,
      extraTax: 0,
      furtherTax: 0,
      sroScheduleNo: "",
      fedPayable: 0,
      discount: money(line.lineDiscount),
      saleType: "Goods at standard rate (default)",
      sroItemSerialNo: "",
    };
  });

  const reconciledTax = items.reduce((sum, item) => sum + item.salesTaxApplicable, 0);
  const reconciledTotal = items.reduce((sum, item) => sum + item.totalValues, 0);
  if (Math.abs(money(reconciledTax) - money(gstAmount)) > 0.01) {
    preflight.push({
      path: "items[].salesTaxApplicable",
      code: "GST_TOTAL_MISMATCH",
      message: "Line sales tax does not reconcile to the stored invoice GST amount.",
    });
  }
  if (Math.abs(money(reconciledTotal) - money(invoiceTotal)) > 0.01) {
    preflight.push({
      path: "items[].totalValues",
      code: "INVOICE_TOTAL_MISMATCH",
      message: "FBR line totals do not reconcile to the stored invoice total.",
    });
  }

  const payload: FbrInvoicePayload = {
    invoiceType: "Sale Invoice",
    invoiceDate: invoice.issuedAt.toISOString().slice(0, 10),
    sellerNTNCNIC: normalizeTaxId(invoice.workspace.ntn) ?? "",
    sellerBusinessName: invoice.workspace.name,
    sellerProvince: invoice.workspace.province ?? "",
    sellerAddress: invoice.workspace.address ?? invoice.workspace.city ?? "",
    buyerNTNCNIC: normalizeTaxId(invoice.customer.taxId),
    buyerBusinessName: invoice.customer.companyName ?? invoice.customer.name,
    buyerProvince: invoice.customer.province ?? "",
    buyerAddress: invoice.customer.address ?? invoice.customer.city ?? "",
    buyerRegistrationType: normalizeRegistrationType(invoice.customer.registrationType),
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

export async function prepareFbrInvoiceSubmission(invoiceId: string) {
  const context = await requirePermission("financial.manage");
  const draft = await buildFbrInvoiceDraft(context.workspaceId, invoiceId);
  const { invoice, environment, payload, issues } = draft;
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
