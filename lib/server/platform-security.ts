import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const PLATFORM_REAUTH_COOKIE = "munshios_platform_reauth";
const PLATFORM_REAUTH_MAX_AGE_SECONDS = 10 * 60;

function reauthSecret() {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is required for platform reauthentication.");
  return secret;
}

export function createPlatformReauthToken(sessionId: string, issuedAtMs: number, secret: string) {
  const payload = `${sessionId}.${issuedAtMs}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${issuedAtMs}.${signature}`;
}

export function verifyPlatformReauthToken(sessionId: string, token: string | undefined, secret: string, nowMs = Date.now()) {
  if (!token) return false;
  const [issuedAtRaw, signature] = token.split(".");
  if (!issuedAtRaw || !signature) return false;
  const issuedAtMs = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAtMs)) return false;
  const ageMs = nowMs - issuedAtMs;
  if (ageMs < 0 || ageMs > PLATFORM_REAUTH_MAX_AGE_SECONDS * 1000) return false;

  const expected = createPlatformReauthToken(sessionId, issuedAtMs, secret).split(".")[1];
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function markPlatformPasswordVerified(sessionId: string) {
  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_REAUTH_COOKIE, createPlatformReauthToken(sessionId, Date.now(), reauthSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/platform",
    maxAge: PLATFORM_REAUTH_MAX_AGE_SECONDS,
  });
}

async function hasRecentPlatformPasswordVerification(sessionId: string) {
  const cookieStore = await cookies();
  return verifyPlatformReauthToken(sessionId, cookieStore.get(PLATFORM_REAUTH_COOKIE)?.value, reauthSecret());
}

export async function getVerifiedPlatformOwnerIdentity() {
  const configuredOwner = process.env.MUNSHIOS_PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredOwner) redirect("/dashboard");

  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  if (!userId) redirect("/platform/sign-in");

  const clerkUser = await (await clerkClient()).users.getUser(userId);
  const primaryEmail =
    clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId) ??
    clerkUser.emailAddresses[0];
  const email = primaryEmail?.emailAddress?.trim().toLowerCase();

  if (!email || primaryEmail?.verification?.status !== "verified" || email !== configuredOwner) {
    redirect("/dashboard");
  }

  return clerkUser;
}

async function requireRecentPlatformPassword() {
  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const sessionId = "sessionId" in session ? session.sessionId : null;
  if (!sessionId || !(await hasRecentPlatformPasswordVerification(sessionId))) {
    redirect("/platform/sign-in?reauth=1");
  }
}

export async function requirePlatformMfa() {
  const clerkUser = await getVerifiedPlatformOwnerIdentity();
  if (!clerkUser.twoFactorEnabled) redirect("/platform/security");
  await requireRecentPlatformPassword();
  return clerkUser;
}

export async function assertPlatformMfaEnabled() {
  const clerkUser = await getVerifiedPlatformOwnerIdentity();
  if (!clerkUser.twoFactorEnabled) {
    throw new Error("Platform MFA is required. Enable two-factor authentication in Platform Security before continuing.");
  }
  await requireRecentPlatformPassword();
  return clerkUser;
}
