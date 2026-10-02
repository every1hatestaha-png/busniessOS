import "server-only";

import { Prisma } from "@prisma/client";
import { IndustryDomainError } from "@/lib/server/industry-modules";
import type { RestaurantV1ActionState } from "@/app/(dashboard)/restaurant/v1-action-state";

const EXPECTED_SQL_STATES = new Set(["P0001", "23505", "23503", "23514", "40001", "40P01", "22P02"]);
const EXPECTED_DATABASE_ERRORS = new Set(["P2002", "P2003", "P2004", "P2025", "P2028", "P2034"]);

// Only expected domain/database failures become form feedback. Redirects and
// programmer errors must propagate to Next's normal exception handling.
export function restaurantActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof IndustryDomainError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError && EXPECTED_DATABASE_ERRORS.has(error.code)) return fallback;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010") {
    // Raw-query errors also include programmer mistakes such as SQL syntax.
    // Only recognised constraint/trigger/concurrency states are expected here.
    const state = String(error.meta?.code ?? "");
    if (EXPECTED_SQL_STATES.has(state)) return fallback;
  }
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
