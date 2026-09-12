export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELLED" | "SUSPENDED";

export type SubscriptionSnapshot = {
  id: string;
  workspaceId: string;
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  status: SubscriptionStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  overrideUntil: Date | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
};

export type WorkspaceAccess = SubscriptionSnapshot & {
  allowed: boolean;
  reason: "suspended" | "override" | "trial" | "active" | "grace" | "expired";
  daysRemaining: number | null;
};

function daysUntil(date: Date | null, now: Date) {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 86_400_000));
}

export function computeWorkspaceAccess(row: SubscriptionSnapshot, now = new Date()): WorkspaceAccess {
  const nowMs = now.getTime();
  const isFuture = (date: Date | null) => Boolean(date && date.getTime() > nowMs);

  if (row.status === "SUSPENDED") {
    return { ...row, allowed: false, reason: "suspended", daysRemaining: null };
  }
  if (isFuture(row.overrideUntil)) {
    return { ...row, allowed: true, reason: "override", daysRemaining: daysUntil(row.overrideUntil, now) };
  }
  if (row.status === "TRIALING" && isFuture(row.trialEndsAt)) {
    return { ...row, allowed: true, reason: "trial", daysRemaining: daysUntil(row.trialEndsAt, now) };
  }
  if (row.status === "ACTIVE" && (!row.currentPeriodEnd || isFuture(row.currentPeriodEnd))) {
    return { ...row, allowed: true, reason: "active", daysRemaining: daysUntil(row.currentPeriodEnd, now) };
  }
  if (isFuture(row.graceEndsAt)) {
    return { ...row, allowed: true, reason: "grace", daysRemaining: daysUntil(row.graceEndsAt, now) };
  }

  return { ...row, allowed: false, reason: "expired", daysRemaining: 0 };
}
