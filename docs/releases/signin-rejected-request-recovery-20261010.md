# Sign-in network rejection recovery (draft)
The browser login form had no rejection handler around `supabase.auth.signInWithPassword()`. If the promise rejects, `busy` remained `true`, leaving "Signing in..." disabled and a rejected UI handler.

This change catches **only thrown request failures**, uses the existing generic and non-enumerating user-facing error, and clears the loading state. An ordinary returned `AuthError` continues through the existing `getSignInFeedback` logic; successful sign-ins continue to `postAuthDestination` unchanged. Do not show provider errors, credentials, or account existence details.

An offline test simulates a rejected secret-bearing network error and verifies: no navigation, generic feedback, loading state reset, and no leakage of raw error details.

Security boundaries: no session, policy, email verification, database migration, auth provider config, Supabase or Vercel settings, prod deployment or merge changes. New draft branch has Vercel automatic deployment explicitly disabled. CI uses synthetic config, no hosted database or live auth.

Based on draft #315 `integrate/security-stack-on-marketing-20261009`; not stacked on the sterile Neon migration branch and does not unblock hosted migration.
