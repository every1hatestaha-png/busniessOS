# MunshiOS web authentication release notes

## Production architecture

Customer web traffic uses Supabase Auth. Clerk remains limited to legacy desktop/platform paths.

Identity mapping:
- Supabase user id -> users.supabaseId
- Clerk user id -> users.clerkId
- Existing Clerk users are linked to Supabase by verified email once, without replacing their Clerk id.

## Required environment

The app no longer falls back to a hardcoded Supabase project.

Required in every deployed environment:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

A missing or invalid value must fail closed.

## Signup confirmation

The existing PKCE callback remains supported at:

/auth/callback?next=/onboarding

For durable cross-device confirmation, MunshiOS also supports token-hash verification at:

/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding

Before switching the Supabase signup email template to token-hash confirmation, verify the route in a nonproduction Supabase project first.

Recommended signup email confirmation target:

{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding

Keep the existing recovery email flow separate. Do not point password-recovery templates at the signup confirmation route.

## Release order

1. Validate this branch in CI.
2. Apply the users.supabaseId migration in nonproduction.
3. Verify fresh signup, resend, confirmation, sign-in, recovery, onboarding and an existing legacy user.
4. Verify that missing Clerk configuration does not break normal customer web auth.
5. Only after nonproduction acceptance, merge and run the production migration through the normal controlled release process.
6. Deploy the exact approved main SHA.
7. Update the production Supabase signup template to the token-hash route only after the deployed route is live.
8. Monitor Supabase auth logs and Vercel runtime logs.

Do not migrate the Restaurant staging project or its users into the production auth project.
