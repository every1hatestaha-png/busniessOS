import "server-only";

import { cookies } from "next/headers";

export const RECOVERY_COOKIE_NAME = "businessos_recovery_verified";
export const RECOVERY_WINDOW_SECONDS = 10 * 60;

const RECOVERY_METHODS = new Set(["otp", "recovery", "magiclink"]);

type AmrEntry = {
  method?: unknown;
  timestamp?: unknown;
};

export function hasFreshRecoveryProof(claims: unknown, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!claims || typeof claims !== "object") return false;
  const amr = (claims as { amr?: unknown }).amr;
  if (!Array.isArray(amr)) return false;

  return amr.some((rawEntry) => {
    if (!rawEntry || typeof rawEntry !== "object") return false;
    const entry = rawEntry as AmrEntry;
    if (typeof entry.method !== "string" || !RECOVERY_METHODS.has(entry.method)) return false;
    if (typeof entry.timestamp !== "number" || !Number.isFinite(entry.timestamp)) return false;

    const age = nowSeconds - entry.timestamp;
    return age >= -30 && age <= RECOVERY_WINDOW_SECONDS;
  });
}

export async function issueRecoveryMarker() {
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE_NAME, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: RECOVERY_WINDOW_SECONDS,
  });
}

export async function clearRecoveryMarker() {
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function hasRecoveryMarker() {
  const cookieStore = await cookies();
  return cookieStore.get(RECOVERY_COOKIE_NAME)?.value === "1";
}
