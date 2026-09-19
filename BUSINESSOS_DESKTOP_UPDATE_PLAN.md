# MunshiOS Desktop Update Plan

## Current production design — 2026-09-19

MunshiOS desktop update support is implemented in `desktop/updater.cjs` and wired into packaged-app startup.

### Update behavior

- Checks the latest stable GitHub Release after startup and every six hours.
- Only accepts a release with a Windows installer and matching `.sha256` manifest.
- Streams the installer to disk and verifies SHA-256 before any install action.
- Verifies Windows Authenticode before automatic installation.
- Refuses automatic installation when the installer does not have a valid Windows signature.
- Prompts before download and again before installation.
- Uses a detached Windows helper only after validation so the running app can close before NSIS replaces files.
- Keeps application data outside the installer so an update does not erase business data.

### Release pipeline

`.github/workflows/desktop-release.yml`:

1. Runs desktop smoke tests.
2. Packages the Windows NSIS installer.
3. Generates a SHA-256 manifest.
4. Validates Authenticode when signing credentials are configured.
5. Publishes the installer and checksum to a GitHub Release.

The release workflow reads these optional GitHub Actions secrets:

- `WINDOWS_CSC_LINK`
- `WINDOWS_CSC_KEY_PASSWORD`

If a trusted Windows code-signing credential is not configured, a checksum-verified release can still be published for manual installation, but the MunshiOS updater deliberately blocks automatic installation.

### Security model

The updater requires both integrity and platform trust:

1. The downloaded installer SHA-256 must match the release manifest.
2. Windows Authenticode must report a valid signature before automatic installation.

A valid checksum alone is not enough to trigger unattended installation. This prevents a compromised or incorrectly published unsigned installer from being silently executed.

### Rollback

Automatic downgrade is intentionally unsupported. Rollback remains a controlled manual operation:

1. Exit MunshiOS.
2. Install the previous trusted release.
3. Keep the existing MunshiOS user-data directory.
4. Verify login, workspace access, and database compatibility.

Database records are remote and are not deleted by reinstalling the desktop client.

### Remaining external dependency

The software-side updater and release pipeline are complete. A trusted Windows code-signing certificate is still an external release credential. Until that certificate is configured, Windows may show SmartScreen warnings and MunshiOS will require manual installation for new desktop releases.

### Stable application identity

The Electron product name and shortcuts are MunshiOS. The internal Windows app identifier remains `com.businessos.desktop` for upgrade compatibility with earlier installed BusinessOS builds; changing it would risk creating a second installation instead of upgrading the existing client.
