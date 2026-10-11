"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { outboundGatePassDraftSchema } from "@/lib/delivery-acceptance/draft-validation";
import { requirePermission } from "@/lib/server/authorization";
import { outboundGatePassDraftFeatureEnabled } from "@/lib/server/outbound-gate-pass-feature";
import { createOutboundGatePassDraft, OutboundGatePassDomainError } from "@/lib/server/outbound-gate-passes";

export type CreateOutboundGatePassState = { error?: string };

export async function createOutboundGatePassDraftAction(
  _previous: CreateOutboundGatePassState,
  form: FormData,
): Promise<CreateOutboundGatePassState> {
  const context = await requirePermission("sales.create");
  if (!outboundGatePassDraftFeatureEnabled(context.workspaceId)) {
    return { error: "Gate pass drafts are unavailable in this workspace." };
  }

  const itemsJson = form.get("itemsJson");
  if (typeof itemsJson !== "string" || itemsJson.length > 25_000) {
    return { error: "Invalid gate pass items." };
  }
  let items: unknown;
  try {
    items = JSON.parse(itemsJson);
  } catch {
    return { error: "Invalid gate pass items." };
  }

  const parsed = outboundGatePassDraftSchema.safeParse({
    customerId: form.get("customerId"),
    warehouseId: form.get("warehouseId") ?? "",
    date: form.get("date"),
    deliveryAddress: form.get("deliveryAddress") ?? "",
    notes: form.get("notes") ?? "",
    idempotencyKey: form.get("idempotencyKey"),
    items,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the gate pass details." };
  }

  let id: string;
  try {
    const created = await createOutboundGatePassDraft({
      workspaceId: context.workspaceId,
      userId: context.user.id,
    }, parsed.data);
    id = created.id;
  } catch (error) {
    if (error instanceof OutboundGatePassDomainError || error instanceof z.ZodError) {
      return { error: error.message };
    }
    return { error: "Could not create the draft. Refresh and try again." };
  }

  revalidatePath("/gate-passes");
  redirect("/gate-passes/" + id);
}
