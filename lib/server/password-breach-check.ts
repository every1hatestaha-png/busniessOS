import "server-only";

import { createHash } from "node:crypto";

export type PasswordBreachResult = "safe" | "compromised" | "unavailable";

/**
 * Application-layer compensating control for Supabase Free plans.
 * Never sends the plaintext password or its full hash to HIBP.
 * Rejects on network/provider failures rather than incorrectly claiming safe.
 * This is not a replacement for provider-enforced leaked-password protection.
 */
export async function checkPasswordAgainstBreaches(password: string): Promise<PasswordBreachResult> {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) return "unavailable";
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: "GET",
      headers: { "Add-Padding": "true", "User-Agent": "MunshiOS-Password-Safety/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return "unavailable";
    const lines = (await response.text()).split(/\r?\n/);
    let validEntries = 0;
    for (const line of lines) {
      const match = /^([A-Fa-f0-9]{35}):([0-9]+)\s*$/.exec(line);
      if (!match) continue;
      validEntries += 1;
      // Entries with a zero count are HIBP padding, not breached passwords.
      if (match[1]!.toUpperCase() === suffix && Number(match[2]) > 0) return "compromised";
    }
    return validEntries > 0 ? "safe" : "unavailable";
  } catch {
    return "unavailable";
  }
}
