"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/server/authorization";
import { outboundGatePassDraftFeatureEnabled } from "@/lib/server/outbound-gate-pass-feature";
import { GatePassBomError } from "@/lib/server/outbound-gate-pass-bom";
import {
  issueGatePass, dispatchGatePass, cancelUndispatchedGatePass, recordGatePassReceiving,
  confirmRejectedStockReturn, invoiceAcceptedGatePass, GatePassWorkflowError,
} from "@/lib/server/outbound-gate-pass-lifecycle";

export type GatePassActionState = { error?: string; ok?: string };
const uuid = z.string().uuid();

async function context(permission: "sales.create" | "inventory.adjust" | "returns.create" | "financial.manage") {
  const user = await requirePermission(permission);
  if (!outboundGatePassDraftFeatureEnabled(user.workspaceId))
    throw new GatePassWorkflowError("This workspace is not enabled for the delivery workflow.");
  return { workspaceId: user.workspaceId, userId: user.user.id, role: user.role };
}

function failure(error: unknown): GatePassActionState {
  if (error instanceof GatePassWorkflowError || error instanceof GatePassBomError || error instanceof z.ZodError)
    return { error: error.message };
  return { error: "The operation could not be completed. Refresh and try again." };
}
function invalidate(id: string) {
  revalidatePath("/gate-passes");
  revalidatePath("/gate-passes/pending-invoices");
  revalidatePath(`/gate-passes/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/invoices");
  revalidatePath("/sales");
}

export async function issueGatePassAction(_: GatePassActionState, form: FormData): Promise<GatePassActionState> {
  const ctx = await context("sales.create");
  try {
    const id = uuid.parse(form.get("gatePassId"));
    await issueGatePass(ctx, id);
    invalidate(id);
    return { ok: "Gate pass issued. Print it before dispatch." };
  } catch (error) { return failure(error); }
}

export async function cancelGatePassAction(_: GatePassActionState, form: FormData): Promise<GatePassActionState> {
  const ctx = await context("sales.create");
  try {
    const id = uuid.parse(form.get("gatePassId"));
    await cancelUndispatchedGatePass(ctx, id);
    invalidate(id);
    return { ok: "Undispatched gate pass cancelled." };
  } catch (error) { return failure(error); }
}

export async function dispatchGatePassAction(_: GatePassActionState, form: FormData): Promise<GatePassActionState> {
  const ctx = await context("inventory.adjust");
  try {
    const id = uuid.parse(form.get("gatePassId"));
    await dispatchGatePass(ctx, id);
    invalidate(id);
    return { ok: "Physical dispatch recorded." };
  } catch (error) { return failure(error); }
}

export async function receivingGatePassAction(_: GatePassActionState, form: FormData): Promise<GatePassActionState> {
  const ctx = await context("returns.create");
  try {
    const id = uuid.parse(form.get("gatePassId"));
    const itemsRaw = form.get("linesJson");
    if (typeof itemsRaw !== "string" || itemsRaw.length > 30_000) return { error: "Invalid receiving lines." };
    const lines: unknown = JSON.parse(itemsRaw);
    await recordGatePassReceiving(ctx, {
      gatePassId: id, reference: form.get("reference"), recipient: form.get("recipient"),
      notes: form.get("notes") ?? "", lines,
    });
    invalidate(id);
    return { ok: "Customer receiving recorded." };
  } catch (error) { return failure(error); }
}

export async function returnedGatePassAction(_: GatePassActionState, form: FormData): Promise<GatePassActionState> {
  const ctx = await context("returns.create");
  try {
    const id = uuid.parse(form.get("gatePassId"));
    const itemsRaw = form.get("linesJson");
    if (typeof itemsRaw !== "string" || itemsRaw.length > 30_000) return { error: "Invalid returned item lines." };
    await confirmRejectedStockReturn(ctx, { gatePassId: id, lines: JSON.parse(itemsRaw) });
    invalidate(id);
    return { ok: "Physical return confirmed. Stock restored once." };
  } catch (error) { return failure(error); }
}

export async function invoiceGatePassAction(_: GatePassActionState, form: FormData): Promise<GatePassActionState> {
  const ctx = await context("financial.manage");
  let invoiceId: string;
  try {
    const gatePassId = uuid.parse(form.get("gatePassId"));
    const itemsRaw = form.get("linesJson");
    if (typeof itemsRaw !== "string" || itemsRaw.length > 30_000) return { error: "Invalid invoice line details." };
    const lines: unknown = JSON.parse(itemsRaw);
    const result = await invoiceAcceptedGatePass(ctx, {
      gatePassId, lines, complianceAcknowledged: form.get("complianceAcknowledged") === "yes",
    });
    invoiceId = result.id;
    invalidate(gatePassId);
  } catch (error) { return failure(error); }
  redirect(`/invoices/${invoiceId}`);
}
