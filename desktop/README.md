# BusinessOS desktop development

Run from the repository root:

```powershell
npm run desktop:dev
```

This starts Next.js development mode at `http://localhost:3210`, waits for
`/api/health`, and launches Electron with DevTools. Renderer edits use Next Fast
Refresh. Saving `desktop/main.cjs` or `desktop/preload.cjs` restarts Electron after
a short debounce, keeping Next running. Closing Electron or pressing Ctrl+C stops
the launcher and its Next process. No packaging command is involved.

The embedded server remains on **localhost**; OAuth's registered callback stays
`http://127.0.0.1:49200/desktop-auth/callback`. Keep that port available.

Use `.env.development.local` for your development database and Clerk configuration.
Next's normal environment precedence applies, including `.env.local` as a fallback.
The launcher loads the same environment for Electron so `CLERK_OAUTH_CLIENT_ID`
and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are available to its OAuth code. Environment
changes require stopping and restarting `desktop:dev`.

Development cookies, logs and safeStorage credentials live in `.desktop-dev/`,
separate from the installed app. Normal restarts preserve this development login;
logout clears its credentials and app storage. Do not use a production database
for automated development verification. `BUSINESSOS_DEV_PORT` optionally changes
3210. `BUSINESSOS_DEV_INSPECT_PORT` optionally enables Electron's local debugging
endpoint for automation; it is off by default.

Other commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Web-only Next development |
| `npm run desktop:test` | Real Electron click/IPC/storage test using isolated Clerk fixtures, no DB |
| `npm run build` | Next production build |
| `npm run desktop:package` | Stage an existing Next build and create the Windows installer |
| `npm run desktop:build` | Next build followed by desktop packaging |

Packaging uses the existing stable `dist-desktop/` output. Close the packaged
app before packaging. If OneDrive holds a build artifact open, release the lock
before retrying; development does not write there.

Generated folders, safe to remove when their processes are stopped and their
installers are no longer needed: `.next/`, `.next-d5-locked/`, `.desktop-stage/`,
`.desktop-test/`, `dist-desktop/`, and all `dist-desktop-*/` folders. `dist/`,
`out/`, `release/`, and `build/` are also ignored output names. Removing
`.desktop-dev/` resets development login and deletes its logs; keep it if needed.
Nothing is automatically deleted by the output inventory or ignore changes.

The repository **business-os/** is the source folder. Keep `app/`, `components/`,
`desktop/`, `lib/`, `prisma/`, `public/`, `tests/`, project configuration and `.git/`.
In particular `desktop/` contains source and is not build output.

Logout diagnostics use `[D6][logout]`: click, Clerk completion, preload, IPC,
Bearer disable, credential deletion, storage cleanup and navigation. A failed
step is shown beside the button and logged by stage without credential contents.
The isolated test uses a Clerk fixture; it does not prove remote Clerk session
selection or Account A/B authorization. Desktop account switching requires Clerk
Dashboard **Multi-session handling** to be enabled. Switch account opens Clerk's
supported Account Portal `/sign-in/choose` route; Account A remains recoverable
until Account B completes OAuth, then Electron atomically clears Account A storage
and installs Account B credentials. Verify real account switching manually against
a development database.
