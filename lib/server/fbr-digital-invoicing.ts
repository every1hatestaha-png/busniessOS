import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { validateFbrInvoicePayload, type FbrInvoicePayload, type FbrValidationIssue } from "@/lib/fbr/digital-invoicing";
import { validateFbrProductionCompliance } from "@/lib/fbr/production-compliance";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { writeAudit } from "@/lib/server/audit";

function money(value: number) {
  return Number(value.toFixed(2));
}

function normalizeRegistrationType(value: string | null): "Registered" | "Unregistered" {
  return value === "Registered" ? "Registered" : "Unregistered";
}

function submissionKey(workspaceId: string, invoiceId: string, environment: "SANDBOX" | "PRODUCTION") {
  return createHash("sha256").update(`fbr:${workspaceId}:${invoiceId}:${environment}:v1`).digest("hex");
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

export async function prepareFbrInvoiceSubmission(invoiceId: string) {
  const context = await requirePermission("financial.manage");
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, workspaceId: context.workspaceId },
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
  if (invoice.status === "CANCELLED") throw new Error("Cancelled invoices cannot be prepared for FBR.");
  if (!invoice.salesOrder) throw new Error("FBR submission requires a linked sales order.");
  if (!invoice.salesOrder.items.length) throw new Error("FBR submission requires at least one invoice item.");

  const config = await db.fbrIntegrationConfig.findUnique({ where: { workspaceId: context.workspaceId } });
  const environment = config?.environment ?? "SANDBOX";
  const preflight: FbrValidationIssue[] = [];

  if (!config?.enabled) {
    preflight.push({ path: "integration.enabled", code: "INTEGRATION_DISABLED", message: "FBR Digital Invoicing is not enabled for this workspace." });
  }
  if (!invoice.workspace.province?.trim()) {
    preflight.push({ path: "sellerProvince", code: "MISSING_MASTER_DATA", message: "Add the seller province in business settings." });
  }
  if (!invoice.customer.registrationType || !["Registered", "Unregistered"].includes(invoice.customer.registrationType)) {
    preflight.push({ path: "buyerRegistrationType", code: "MISSING_MASTER_DATA", message: "Set the buyer FBR registration type." });
  }
  if (environment === "SANDBOX" && !config?.defaultScenarioId?.trim()) {
    preflight.push({ path: "scenarioId", code: "MISSING_MASTER_DATA", message: "Choose an FBR sandbox scenario before validation." });
  }

  if (environment === "PRODUCTION") {
    preflight.push(...validateFbrProductionCompliance({
      provider: config?.provider,
      integratorName: config?.integratorName,
      integratorLicenseNo: config?.integratorLicenseNo,
      productionApprovedAt: config?.productionApprovedAt,
      productionApprovedBy: config?.productionApprovedBy,
    }));
  }

  const subtotal = Number(invoice.salesOrder.subtotal);
  const discount = Number(invoice.salesOrder.discount);
  const taxableAmount = Math.max(0, subtotal - discount);
  const gstAmount = Math.max(0, Number(invoice.amount) - taxableAmount);
  const gstRate = taxableAmount > 0 ? (gstAmount / taxableAmount) * 100 : 0;

  if (!(gstRate > 0)) {
    preflight.push({
      path: "items[].rate",
      code: "UNSUPPORTED_TAX_MAPPING",
      message: "This foundation currently requires a positive standard sales-tax rate. Zero-rated/exempt/SRO scenarios need explicit FBR mapping.",
    });
  }

  const payload: FbrInvoicePayload = {
    invoiceType: "Sale Invoice",
    invoiceDate: invoice.issuedAt.toISOString().slice(0, 10),
    sellerNTNCNIC: invoice.workspace.ntn ?? "",
    sellerBusinessName: invoice.workspace.name,
    sellerProvince: invoice.workspace.province ?? "",
    sellerAddress: invoice.workspace.address ?? invoice.workspace.city ?? "",
    buyerNTNCNIC: invoice.customer.taxId ?? undefined,
    buyerBusinessName: invoice.customer.companyName ?? invoice.customer.name,
    buyerProvince: invoice.customer.province ?? "",
    buyerAddress: invoice.customer.address ?? invoice.customer.city ?? "",
    buyerRegistrationType: normalizeRegistrationType(invoice.customer.registrationType),
    invoiceRefNo: "",
    ...(environment === "SANDBOX" ? { scenarioId: config?.defaultScenarioId ?? "" } : {}),
    items: invoice.salesOrder.items.map((item, index) => {
      if (!item.product.fbrHsCode?.trim()) {
        preflight.push({ path: `items[${index}].hsCode`, code: "MISSING_MASTER_DATA", message: `Add an FBR HS code to ${item.product.name}.` });
      }
      if (!item.product.fbrUom?.trim()) {
        preflight.push({ path: `items[${index}].uoM`, code: "MISSING_MASTER_DATA", message: `Add an FBR unit of measurement to ${item.product.name}.` });
      }
      const quantity = Number(item.quantity);
      const gross = quantity * Number(item.unitPrice);
      const lineDiscount = quantity * Number(item.discountPerUnit);
      const valueSalesExcludingST = Math.max(0, gross - lineDiscount);
      const salesTaxApplicable = valueSalesExcludingST * (gstRate / 100);
      return {
        hsCode: item.product.fbrHsCode ?? "",
        productDescription: item.productName ?? item.product.name,
        rate: `${Number(gstRate.toFixed(4))}%`,
        uoM: item.product.fbrUom ?? "",
        quantity,
        totalValues: money(valueSalesExcludingST + salesTaxApplicable),
        valueSalesExcludingST: money(valueSalesExcludingST),
        fixedNotifiedValueOrRetailPrice: 0,
        salesTaxApplicable: money(salesTaxApplicable),
        salesTaxWithheldAtSource: 0,
        extraTax: 0,
        furtherTax: 0,
        sroScheduleNo: "",
        fedPayable: 0,
        discount: money(lineDiscount),
        saleType: "Goods at standard rate (default)",
        sroItemSerialNo: "",
      };
    }),
  };

  const issues = [...preflight, ...validateFbrInvoicePayload(payload, environment)];
  const status = issues.length ? "BLOCKED" : "DRAFT";
  const idempotencyKey = submissionKey(context.workspaceId, invoice.id, environment);

  const submission = await db.$transaction(async (tx) => {
    const existing = await tx.fbrInvoiceSubmission.findFirst({ where: { invoiceId: invoice.id, environment } });
    if (existing?.status === "SUBMITTED") return existing;

    const saved = existing
      ? await tx.fbrInvoiceSubmission.update({
          where: { id: existing.id },
          data: {
            environment,
            status,
            idempotencyKey,
            payloadSnapshot: payload as unknown as Prisma.InputJsonValue,
            validationResponse: issues as unknown as Prisma.InputJsonValue,
            lastErrorCode: issues[0]?.code ?? null,
            lastErrorMessage: issues[0]?.message ?? null,
          },
        })
      : await tx.fbrInvoiceSubmission.create({
          data: {
            workspaceId: context.workspaceId,
            invoiceId: invoice.id,
            environment,
            status,
            idempotencyKey,
            payloadSnapshot: payload as unknown as Prisma.InputJsonValue,
            validationResponse: issues as unknown as Prisma.InputJsonValue,
            lastErrorCode: issues[0]?.code ?? null,
            lastErrorMessage: issues[0]?.message ?? null,
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
      },
    });
    return saved;
  });

  return { submission, payload, issues, readyForRemoteValidation: issues.length === 0 };
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
