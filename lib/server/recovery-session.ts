import "server-only";

import { cookies } from "next/headers";

import { RECOVERY_WINDOW_SECONDS } from "@/lib/auth-recovery-proof";

export const RECOVERY_COOKIE_NAME = "businessos_recovery_verified";

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
