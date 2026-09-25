"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/server/auth";
import {
  approveProductionRun,
  cancelProductionRun,
  createBom,
  createProductionRun,
  createWarehouse,
  IndustryDomainError,
  postProductionRun,
} from "@/lib/server/industry-modules";

export type ManufacturingActionState = {
  status: "idle" | "success" | "error";
  message: string;
};


function fail(message: string): ManufacturingActionState {
  return { status: "error", message };
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof IndustryDomainError ? error.message : fallback;
}

export async function createWarehouseAction(
  _previous: ManufacturingActionState,
  formData: FormData,
): Promise<ManufacturingActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const address = String(formData.get("address") ?? "").trim();
  const isDefault = formData.get("isDefault") === "on";

  if (name.length < 1 || name.length > 100) return fail("Warehouse name must be 1–100 characters.");
  if (!/^[A-Z0-9_-]{1,24}$/.test(code)) return fail("Use a warehouse code up to 24 letters, numbers, dashes, or underscores.");
  if (address.length > 250) return fail("Address must be 250 characters or fewer.");

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await createWarehouse({ workspaceId, role, userId: user.id }, { name, code, address: address || undefined, isDefault });
    revalidatePath("/manufacturing");
    return { status: "success", message: `${name} added.` };
  } catch (error) {
    return fail(messageFor(error, "We could not add this warehouse. Check for a duplicate code and try again."));
  }
}

type BomMaterialInput = { materialProductId?: unknown; quantity?: unknown; wastagePercent?: unknown };

export async function createBomAction(
  _previous: ManufacturingActionState,
  formData: FormData,
): Promise<ManufacturingActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const finishedProductId = String(formData.get("finishedProductId") ?? "").trim();
  const outputQuantity = Number(formData.get("outputQuantity") ?? 1);
  const version = Number(formData.get("version") ?? 1);
  const notes = String(formData.get("notes") ?? "").trim();

  let rawItems: BomMaterialInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("itemsJson") ?? "[]"));
    if (!Array.isArray(parsed)) return fail("BOM materials are invalid.");
    rawItems = parsed;
  } catch {
    return fail("BOM materials are invalid.");
  }

  if (name.length < 1 || name.length > 120) return fail("BOM name must be 1–120 characters.");
  if (!/^[0-9a-f-]{36}$/i.test(finishedProductId)) return fail("Choose a finished product.");
  if (!Number.isFinite(outputQuantity) || outputQuantity <= 0 || outputQuantity > 1_000_000_000) return fail("Output quantity must be positive.");
  if (!Number.isInteger(version) || version < 1 || version > 10_000) return fail("Version must be a positive whole number.");
  if (notes.length > 500) return fail("Notes must be 500 characters or fewer.");
  if (rawItems.length < 1 || rawItems.length > 100) return fail("Add between 1 and 100 BOM materials.");

  const items = rawItems.map((item) => ({
    materialProductId: String(item.materialProductId ?? "").trim(),
    quantity: Number(item.quantity ?? 0),
    wastagePercent: Number(item.wastagePercent ?? 0),
  }));

  const ids = new Set<string>();
  for (const item of items) {
    if (!/^[0-9a-f-]{36}$/i.test(item.materialProductId)) return fail("Choose a product for every material row.");
    if (item.materialProductId === finishedProductId) return fail("The finished product cannot also be a raw material.");
    if (ids.has(item.materialProductId)) return fail("Each raw material can appear only once in a BOM.");
    ids.add(item.materialProductId);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return fail("Every material quantity must be positive.");
    if (!Number.isFinite(item.wastagePercent) || item.wastagePercent < 0 || item.wastagePercent > 100) return fail("Wastage must be between 0% and 100%.");
  }

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await createBom(
      { workspaceId, role, userId: user.id },
      { name, finishedProductId, outputQuantity, version, notes: notes || undefined, items },
    );
    revalidatePath("/manufacturing");
    return { status: "success", message: `${name} created.` };
  } catch (error) {
    return fail(messageFor(error, "We could not create this BOM. Check products and version, then try again."));
  }
}

export async function createProductionRunAction(
  _previous: ManufacturingActionState,
  formData: FormData,
): Promise<ManufacturingActionState> {
  const bomId = String(formData.get("bomId") ?? "").trim();
  const runNumber = String(formData.get("runNumber") ?? "").trim();
  const plannedOutput = Number(formData.get("plannedOutput") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(bomId)) return fail("Choose a BOM.");
  if (runNumber.length < 1 || runNumber.length > 80) return fail("Run number must be 1–80 characters.");
  if (!Number.isFinite(plannedOutput) || plannedOutput <= 0 || plannedOutput > 1_000_000_000) return fail("Planned output must be positive.");
  if (notes.length > 500) return fail("Notes must be 500 characters or fewer.");

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await createProductionRun({ workspaceId, role, userId: user.id }, { bomId, runNumber, plannedOutput, notes: notes || undefined });
    revalidatePath("/manufacturing");
    return { status: "success", message: `Production run ${runNumber} created as draft.` };
  } catch (error) {
    return fail(messageFor(error, "We could not create this production run. Check the run number and BOM."));
  }
}


export async function approveProductionRunAction(
  _previous: ManufacturingActionState,
  formData: FormData,
): Promise<ManufacturingActionState> {
  const productionRunId = String(formData.get("productionRunId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(productionRunId)) return fail("Production run is invalid.");

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await approveProductionRun({ workspaceId, role, userId: user.id }, productionRunId);
    revalidatePath("/manufacturing");
    return { status: "success", message: "Production run approved." };
  } catch (error) {
    return fail(messageFor(error, "We could not approve this production run."));
  }
}

export async function postProductionRunAction(
  _previous: ManufacturingActionState,
  formData: FormData,
): Promise<ManufacturingActionState> {
  const productionRunId = String(formData.get("productionRunId") ?? "").trim();
  const actualOutput = Number(formData.get("actualOutput") ?? 0);
  const wastageQuantity = Number(formData.get("wastageQuantity") ?? 0);

  if (!/^[0-9a-f-]{36}$/i.test(productionRunId)) return fail("Production run is invalid.");
  if (!Number.isFinite(actualOutput) || actualOutput <= 0 || actualOutput > 1_000_000_000) return fail("Actual output must be positive.");
  if (!Number.isFinite(wastageQuantity) || wastageQuantity < 0 || wastageQuantity > 1_000_000_000) return fail("Wastage cannot be negative.");

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    const result = await postProductionRun(
      { workspaceId, role, userId: user.id },
      productionRunId,
      actualOutput,
      wastageQuantity,
    );
    revalidatePath("/manufacturing");
    revalidatePath("/inventory");
    return { status: "success", message: `Production posted. Unit cost: Rs ${result.unitCost.toFixed(2)}.` };
  } catch (error) {
    return fail(messageFor(error, "We could not post this production run. Check raw-material stock and try again."));
  }
}


export async function cancelProductionRunAction(
  _previous: ManufacturingActionState,
  formData: FormData,
): Promise<ManufacturingActionState> {
  const productionRunId = String(formData.get("productionRunId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(productionRunId)) return fail("Production run is invalid.");

  const { workspaceId, role, user } = await requireWorkspace();
  try {
    await cancelProductionRun({ workspaceId, role, userId: user.id }, productionRunId);
    revalidatePath("/manufacturing");
    return { status: "success", message: "Production run cancelled. No inventory was changed." };
  } catch (error) {
    return fail(messageFor(error, "We could not cancel this production run."));
  }
}
