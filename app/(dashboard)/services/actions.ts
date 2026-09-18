"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/server/auth";
import {
  createServiceJob,
  createServiceQuote,
  IndustryDomainError,
} from "@/lib/server/industry-modules";

export type ServicesActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialServicesActionState: ServicesActionState = { status: "idle", message: "" };

function fail(message: string): ServicesActionState {
  return { status: "error", message };
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof IndustryDomainError ? error.message : fallback;
}

type QuoteLineInput = { description?: unknown; quantity?: unknown; unitPrice?: unknown };

export async function createServiceQuoteAction(
  _previous: ServicesActionState,
  formData: FormData,
): Promise<ServicesActionState> {
  const customerId = String(formData.get("customerId") ?? "").trim();
  const quoteNumber = String(formData.get("quoteNumber") ?? "").trim();
  const validUntilRaw = String(formData.get("validUntil") ?? "").trim();
  const discount = Number(formData.get("discount") ?? 0);
  const tax = Number(formData.get("tax") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim();

  let rawItems: QuoteLineInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("itemsJson") ?? "[]"));
    if (!Array.isArray(parsed)) return fail("Quotation lines are invalid.");
    rawItems = parsed;
  } catch {
    return fail("Quotation lines are invalid.");
  }

  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return fail("Choose a client.");
  if (quoteNumber.length < 1 || quoteNumber.length > 80) return fail("Quote number must be 1–80 characters.");
  if (!Number.isFinite(discount) || discount < 0 || discount > 1_000_000_000) return fail("Discount must be a valid non-negative amount.");
  if (!Number.isFinite(tax) || tax < 0 || tax > 1_000_000_000) return fail("Tax must be a valid non-negative amount.");
  if (notes.length > 1000) return fail("Notes must be 1,000 characters or fewer.");
  if (rawItems.length < 1 || rawItems.length > 100) return fail("Add between 1 and 100 quotation lines.");

  const items = rawItems.map((item) => ({
    description: String(item.description ?? "").trim(),
    quantity: Number(item.quantity ?? 0),
    unitPrice: Number(item.unitPrice ?? -1),
  }));
  for (const item of items) {
    if (!item.description || item.description.length > 250) return fail("Every quotation line needs a description up to 250 characters.");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return fail("Every quotation quantity must be positive.");
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) return fail("Unit prices cannot be negative.");
  }

  let validUntil: Date | undefined;
  if (validUntilRaw) {
    validUntil = new Date(`${validUntilRaw}T23:59:59+05:00`);
    if (Number.isNaN(validUntil.getTime())) return fail("Valid-until date is invalid.");
  }

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await createServiceQuote(
      { workspaceId, role, userId: user.id },
      { customerId, quoteNumber, validUntil, discount, tax, notes: notes || undefined, items },
    );
    revalidatePath("/services");
    return { status: "success", message: `Quotation ${quoteNumber} created.` };
  } catch (error) {
    return fail(messageFor(error, "We could not create this quotation. Check the client and quote number."));
  }
}

export async function createServiceJobAction(
  _previous: ServicesActionState,
  formData: FormData,
): Promise<ServicesActionState> {
  const customerId = String(formData.get("customerId") ?? "").trim();
  const serviceQuoteId = String(formData.get("serviceQuoteId") ?? "").trim();
  const jobNumber = String(formData.get("jobNumber") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return fail("Choose a client.");
  if (serviceQuoteId && !/^[0-9a-f-]{36}$/i.test(serviceQuoteId)) return fail("Choose a valid quotation.");
  if (jobNumber.length < 1 || jobNumber.length > 80) return fail("Job number must be 1–80 characters.");
  if (title.length < 1 || title.length > 160) return fail("Job title must be 1–160 characters.");
  if (description.length > 1000) return fail("Description must be 1,000 characters or fewer.");

  let scheduledAt: Date | undefined;
  if (scheduledAtRaw) {
    scheduledAt = new Date(`${scheduledAtRaw}:00+05:00`);
    if (Number.isNaN(scheduledAt.getTime())) return fail("Scheduled date/time is invalid.");
  }

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await createServiceJob(
      { workspaceId, role, userId: user.id },
      {
        customerId,
        serviceQuoteId: serviceQuoteId || undefined,
        jobNumber,
        title,
        description: description || undefined,
        scheduledAt,
      },
    );
    revalidatePath("/services");
    return { status: "success", message: `Service job ${jobNumber} created.` };
  } catch (error) {
    return fail(messageFor(error, "We could not create this service job. Check the client, quote, and job number."));
  }
}
