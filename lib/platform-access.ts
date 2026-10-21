export type PlatformIdentity = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
};

export type PlatformAssurance = {
  currentLevel: string | null;
  nextLevel: string | null;
  currentAuthenticationMethods?: Array<{ method: string; timestamp: number }> | string[] | null;
};

export const PLATFORM_MFA_MAX_AGE_MS = 10 * 60 * 1000;

/** Only a confirmed first-party Supabase identity matching the server owner can administer MunshiOS. */
export function isPlatformOwner(
  identity: PlatformIdentity | null,
  configuredEmail: string | undefined,
  configuredUserId?: string,
): boolean {
  const ownerEmail = configuredEmail?.trim().toLowerCase();
  if (!ownerEmail || !configuredUserId?.trim() || !identity?.email_confirmed_at || identity.is_anonymous) return false;
  if (identity.email?.trim().toLowerCase() !== ownerEmail) return false;
  return identity.id === configuredUserId.trim();
}

/** Server-side strict step-up: a verified TOTP challenge in this session within ten minutes. */
export function hasRecentPlatformMfa(
  assurance: PlatformAssurance | null,
  nowMs = Date.now(),
): boolean {
  if (assurance?.currentLevel !== "aal2" || assurance.nextLevel !== "aal2") return false;
  return Boolean(assurance.currentAuthenticationMethods?.some((entry) => {
    if (typeof entry === "string" || (entry.method !== "totp" && entry.method !== "mfa/totp") || !Number.isFinite(entry.timestamp)) return false;
    const ageMs = nowMs - entry.timestamp * 1000;
    return ageMs >= 0 && ageMs <= PLATFORM_MFA_MAX_AGE_MS;
  }));
}
