"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/server/authorization";
import { CollectionPromiseError, updateCollectionPromiseStatus, upsertCollectionPromise } from "@/lib/server/collection-promises";
import { collectionPromiseSchema, collectionPromiseStatusSchema } from "@/lib/validation/collection-promise";

export type PromiseActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function saveCollectionPromiseAction(input: unknown): Promise<PromiseActionResult> {
  const context = await requirePermission("financial.manage");
  const parsed = collectionPromiseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the promise details." };

  try {
    await upsertCollectionPromise({ ...context, userId: context.user.id }, parsed.data);
  } catch (error) {
    if (error instanceof CollectionPromiseError) return { ok: false, message: error.message };
    return { ok: false, message: "Could not save the payment promise. Please try again." };
  }

  revalidatePath("/collections");
  revalidatePath("/dashboard");
  return { ok: true, message: "Payment promise saved." };
}

export async function resolveCollectionPromiseAction(input: unknown): Promise<PromiseActionResult> {
  const context = await requirePermission("financial.manage");
  const parsed = collectionPromiseStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the promise update." };

  try {
    await updateCollectionPromiseStatus({ ...context, userId: context.user.id }, parsed.data);
  } catch (error) {
    if (error instanceof CollectionPromiseError) return { ok: false, message: error.message };
    return { ok: false, message: "Could not update the payment promise. Please try again." };
  }

  revalidatePath("/collections");
  revalidatePath("/dashboard");
  return { ok: true, message: parsed.data.status === "FULFILLED" ? "Promise marked as kept." : "Promise cancelled." };
}
