import "server-only";

import { Prisma } from "@prisma/client";
import { IndustryDomainError } from "@/lib/server/industry-modules";
import type { RestaurantV1ActionState } from "@/app/(dashboard)/restaurant/v1-action-state";

const EXPECTED_DATABASE_ERRORS = new Set(["P2002", "P2003", "P2004", "P2010", "P2025", "P2028", "P2034"]);

// Only expected domain/database failures become form feedback. Redirects and
// programmer errors must propagate to Next's normal exception handling.
export function restaurantActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof IndustryDomainError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError && EXPECTED_DATABASE_ERRORS.has(error.code)) return fallback;
  throw error;
}

export async function restaurantMutationFeedback(
  mutation: () => Promise<void>,
  success: string,
  fallback: string,
): Promise<RestaurantV1ActionState> {
  try {
    await mutation();
    return { status: "success", message: success };
  } catch (error) {
    return { status: "error", message: restaurantActionErrorMessage(error, fallback) };
  }
}

export function restaurantFormWorkspaceChanged(form: FormData, workspaceId: string) {
  const submitted = form.get("formWorkspaceId");
  return submitted !== null && submitted !== workspaceId;
}
