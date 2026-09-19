"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requestWorkspaceActivation } from "@/lib/server/subscriptions";

export type SubscriptionRequestState = { status?: "success" | "error"; message?: string };

const schema = z.object({
  planCode: z.enum(["starter", "business", "pro"]),
  billing: z.enum(["monthly", "annual"]),
});

export async function requestActivationAction(
  _previousState: SubscriptionRequestState,
  formData: FormData,
): Promise<SubscriptionRequestState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Choose a valid plan and billing cycle." };

  try {
    const result = await requestWorkspaceActivation(parsed.data);
    revalidatePath("/subscription");
    revalidatePath("/platform");
    return {
      status: "success",
      message: result.alreadyRequested
        ? "Your activation request is already queued."
        : "Activation request sent. The MunshiOS account owner can now review it.",
    };
  } catch {
    return { status: "error", message: "Activation request could not be sent. Please try again." };
  }
}
