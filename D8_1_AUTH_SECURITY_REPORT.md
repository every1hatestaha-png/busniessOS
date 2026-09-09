# D8.1 Authentication Security Report

Status: RELEASE BLOCKED pending real packaged-app security matrix completion

## Exact reproduction

Reported sequence: desktop sign-out, new desktop authentication, email entry, OAuth consent, Allow Access, then another BusinessOS account authenticated without a visible password or OTP challenge.

## Clerk multi-session state and affected account browser session

Not yet proven. Controlled Account A and Account B testing must determine whether the affected Chrome profile already held an active Clerk browser session.

## Fresh, incognito, and never-before-used identity results

Pending manual tests with real Clerk, Chrome, and the packaged Electron app.

## Password or OTP challenge result

Pending Clerk Dashboard audit and manual verification.

## Root cause

The packaged desktop normal-login path opened Clerk's OAuth authorization URL directly. An already authenticated Clerk browser identity could therefore proceed directly to OAuth consent. The desktop UI did not clearly represent this as reuse of an existing authenticated browser session.

This evidence does not prove that a fresh identity can authenticate with email alone. That remains a mandatory release gate.

## Security impact

The previous flow created an ambiguous authentication boundary. On a shared browser profile, an existing Clerk session could authorize desktop access without a fresh password or OTP prompt.

## Actual authentication bypass

Undetermined until fresh-browser, fully signed-out, never-before-used-account, and random-email tests finish.

## Logout semantics before and after fix

Before the fix, Sign Out removed encrypted desktop tokens, disabled bearer injection, cleared Electron storage, and returned to desktop authentication. The next normal login opened OAuth authorization directly.

After the fix, Sign Out still terminates only the BusinessOS desktop session. The next login enters through Clerk's explicit account-selection boundary. Existing browser identities may be selected. Another identity must follow Clerk's configured authentication method.

## Switch-account semantics

Switch Account opens the Clerk account chooser while preserving current desktop credentials until replacement OAuth completes. Old credentials are cleared before new credentials are installed.

## Clerk Dashboard configuration changes

Pending audit. Production must enable at least one real authentication strategy for a fresh identity, such as password, email OTP, verified email link, or configured social login.

## Code changes

Normal login and switch-account login now both enter OAuth through Clerk's account-selection route. The desktop authentication page explains existing-session selection and fresh-account authentication. PKCE, state validation, fixed loopback redirect, authorization-code exchange, origin validation, and encrypted desktop token storage remain in place.

## Manual security tests

All six required real-session tests are pending. Fixture tests are regression coverage only and are not security proof.

## Remaining risks

Production Clerk strategy is not yet documented. Browser-session state during the report is unknown. The fixed packaged binary has not passed the manual matrix. The installer lacks a recognized code-signing certificate.

## Final security decision

RELEASE BLOCKED. D8.1 cannot complete until every mandatory manual test passes and production Clerk configuration is documented.
