"use server";

import { auth, reverificationError } from "@clerk/nextjs/server";

export async function authorizeDesktopAccountSwitchAction() {
  const session = await auth({ acceptsToken: ["session_token", "oauth_token"] });
  const userId = "userId" in session ? session.userId : null;
  if (!userId) throw new Error("Authentication is required.");

  if (!session.has({ reverification: "strict_mfa" })) {
    return reverificationError("strict_mfa");
  }

  return { ok: true as const };
}
