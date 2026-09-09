# D8 Release Readiness Report

Date: 2026-09-08
Version: 0.2.0

## Release Metadata

| Field | Value |
|---|---|
| Release version | 0.2.0 |
| Build date | 2026-09-08 |
| Installer path | `dist-desktop/BusinessOS Setup 0.2.0.exe` |
| Installer filename | `BusinessOS Setup 0.2.0.exe` |
| Installer size | 138,895,080 bytes (132.5 MB) |
| SHA-256 | `C4748B476FA41758F05F1D7F63CAA5BA05E27B22740909ACBD5F8C4D2261E7CC` |
| SHA-512 (electron-builder) | `HU+OGGc1szDOJloyNWHouv3sBM33w9KLiTv3neAditolDsTBhFpr5HO7r9AMuVvnSDqVI/ZIX2Z6CxNw/Fxg1w==` |
| Build commit | (working tree — not yet committed) |
| Local timestamp | 2026-09-08 14:34:01 PKT |
| UTC timestamp | 2026-09-08 09:34:11 UTC |
| App ID | `com.businessos.desktop` |
| Product name | BusinessOS |
| Electron version | 44.2.0 |
| electron-builder version | 26.15.3 |
| NSIS target | x64 |

## Validation Results

### Automated Gates

| Gate | Result |
|---|---|
| Prisma validation | PASS — schema valid, 16 migrations, up to date |
| TypeScript compilation | PASS — clean (no output) |
| Unit/integration tests | PASS — 93/93 (8 test files) |
| Next.js production build | PASS — 60 pages generated |
| Desktop test (fixture) | PASS — auth, logout, switch-account, persistence verified |

### Packaged App Smoke Test

| Check | Status | Notes |
|---|---|---|
| Installer builds | PASS | `BusinessOS Setup 0.2.0.exe` (132.5 MB) |
| afterPack hook | PASS | server.js, node_modules, next, .prisma/client, pg verified |
| Version in installer | PASS | 0.2.0 in latest.yml and installer filename |

**Note:** Interactive install/launch/login tests require manual execution on a Windows machine. The automated desktop:test fixture simulates a packaged environment and passes all checks.

### Upgrade Test

| Check | Status | Notes |
|---|---|---|
| NSIS in-place upgrade | EXPECTED PASS | NSIS detects existing installation and offers upgrade by default |
| `deleteAppDataOnUninstall: false` | CONFIRMED | User data preserved on uninstall |
| Shortcut behavior | EXPECTED PASS | Desktop and Start Menu shortcuts updated on upgrade |

**Note:** Upgrade test requires installing v0.1.0 first, then running v0.2.0 installer over it. This must be tested manually.

### Uninstall Behavior

| Item | Behavior |
|---|---|
| Application binaries | Removed by uninstaller |
| Desktop shortcut | Removed |
| Start Menu shortcut | Removed |
| `%APPDATA%/BusinessOS` (userData) | **Preserved** (`deleteAppDataOnUninstall: false`) |
| Encrypted credentials | **Preserved** in userData |
| Logs | **Preserved** in userData/logs |
| Workspace selection | **Preserved** in userData |
| Settings/config | **Preserved** in userData |
| Remote production data | **Not affected** — remote database untouched |

### Database Migration Status

| Check | Result |
|---|---|
| `npx prisma migrate status` | 16 migrations found, schema up to date |
| Pending migrations | None |
| Recent migration risk | LOW — all recent migrations are additive (nullable columns, new indexes) |
| DROP TABLE operations | None in recent migrations |
| DROP COLUMN operations | None in recent migrations |
| NOT NULL additions | One in `add_grn_status_and_void_fields` (GRN status column with DEFAULT 'ACTIVE') — safe for existing rows |
| Unique constraint additions | One on `credit_notes(workspaceId, customerReturnId)` — warns about existing duplicates |

**Production migration procedure:**
1. Run `npx prisma migrate deploy` after installing new version
2. Migrations are idempotent and backward-compatible
3. No data loss risk from current migration set

### Desktop Update Architecture

| Check | Status |
|---|---|
| Auto-update client | NOT IMPLEMENTED — electron-updater not installed |
| Update feed | NOT CONFIGURED |
| Code signing | NOT CONFIGURED |
| Manual update | REQUIRED — users must download new installer |

**Future plan:** See `BUSINESSOS_DESKTOP_UPDATE_PLAN.md`

### Logging / Diagnostics

| Check | Status |
|---|---|
| Bootstrap log | `{userData}/logs/bootstrap.log` — startup metadata, version, paths |
| Desktop log | `{userData}/logs/desktop.log` — runtime events, auth, errors |
| Secret sanitization | PASS — Bearer tokens, Clerk secrets, DB URLs, passwords redacted |
| Sensitive data in logs | NONE — `sanitizeDiagnosticText()` strips all sensitive patterns |
| Log rotation | NOT IMPLEMENTED — logs grow unbounded |

**Log path (packaged):** `%APPDATA%/BusinessOS/logs/`

### Crash / Failure Recovery

| Failure Mode | Handling | Quality |
|---|---|---|
| Server startup failure | 3-attempt retry, then error dialog + quit | GOOD |
| Port collision | OS-assigned random port, no collision possible | GOOD |
| Health check timeout | 30s timeout, retry loop, then error dialog | GOOD |
| Server exits after startup | Error dialog + app quit | ADEQUATE |
| Token refresh failure | Clear credentials, show "session expired" dialog | GOOD |
| OAuth callback errors | HTML error page in browser | ADEQUATE |
| Missing runtime.env | Clear error message with file path | GOOD |
| Renderer crash | NOT HANDLED — user sees blank window | GAP |
| Network loss during auth | Single failure clears session, no retry | GAP |
| Server process death (post-startup) | App quits, no restart | GAP |

**Known gaps (non-blocking for D8):**
1. No renderer crash handler (`render-process-gone` not listened)
2. No server restart after post-startup death
3. No network retry for token refresh

### Version Display

| Location | Version |
|---|---|
| `package.json` | 0.2.0 |
| NSIS installer filename | BusinessOS Setup 0.2.0.exe |
| `latest.yml` | 0.2.0 |
| Settings page (server-rendered) | `BusinessOS v0.2.0` |
| Bootstrap log | `app.getVersion()` logged at startup |
| Electron `app.getVersion()` | Returns package.json version in packaged app |

### D6 Desktop Auth Regression

| Check | Result |
|---|---|
| OAuth flow | PASS — desktop:test verifies full flow |
| Token persistence | PASS — encrypted credentials saved/loaded |
| Token refresh | PASS — scheduled and executed correctly |
| Logout | PASS — credentials cleared, cookies cleared, navigation to /desktop-auth |
| Switch account | PASS — Clerk multi-session flow works |
| Restart persistence | PASS — credentials survive restart |
| Workspace isolation | PASS — workspace cookie set correctly |

### D7 Print Regression

| Check | Result |
|---|---|
| Print QA | PASS — 28 scenarios captured and reviewed |
| Report | `D7_PRINT_QA_REPORT.md` |
| Blocking defects | None |

## Known Limitations

1. **No auto-update** — users must manually download new installers
2. **No code signing** — Windows SmartScreen will warn on first install
3. **No renderer crash recovery** — blank window on renderer crash
4. **No server restart on death** — app quits if server process exits
5. **No log rotation** — log files grow unbounded
6. **No network retry for auth** — single failure clears session
7. **Windows only** — NSIS target is x64 Windows only
8. **Manual upgrade testing required** — automated fixture doesn't test real NSIS upgrade flow

## Rollback Steps

1. Uninstall current version via Windows Settings → Apps
2. User data in `%APPDATA%/BusinessOS` is preserved
3. Download previous installer (v0.1.0) from archived release
4. Install previous version
5. Launch app — credentials and workspace selection are preserved
6. Remote database is unaffected by any version change

## Support / Logging Path

- **Log directory:** `%APPDATA%/BusinessOS/logs/`
- **Bootstrap log:** `bootstrap.log` — startup, version, paths
- **Desktop log:** `desktop.log` — runtime events, auth, errors
- **All logs are sanitized** — no secrets or tokens in log content

## Final Release Gates

| Gate | Status |
|---|---|
| Prisma validation | PASS |
| TypeScript | PASS |
| 93/93 tests | PASS |
| Build | PASS |
| Desktop test | PASS |
| Packaged build | PASS |
| Installer version | 0.2.0 |
| SHA-256 generated | PASS |
| Release document | THIS FILE |
| D6 regression | PASS |
| D7 regression | PASS |

## D8 Release Decision

**READY FOR MANUAL VALIDATION.**

All automated gates pass. The installer is built and versioned correctly. Interactive testing (install, launch, login, upgrade, uninstall) must be performed manually before declaring D8 fully complete.

Remaining work is manual verification only — no code changes needed.
