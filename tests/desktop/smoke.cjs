"use strict";

// Real Electron + real preload + real React button, with Clerk and HTTP content
// isolated from the BusinessOS server and database. Never reads real tokens.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");
const electron = require("electron");
const { app, BrowserWindow, session } = electron;
const root = path.resolve(__dirname, "../..");
const desktopSource = process.env.BUSINESSOS_TEST_ASAR
  ? path.join(path.resolve(process.env.BUSINESSOS_TEST_ASAR), "desktop")
  : path.join(root, "desktop");
const profile = path.join(root, ".desktop-test", "profile");
fs.mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
let server;
let win;
const logs = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = setTimeout(() => { console.error("Desktop test timed out"); app.exit(1); }, 60000);
async function until(check) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await delay(100); }
  throw new Error("Expected UI state did not arrive");
}
async function chooseAccountAction(label) {
  await win.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('button[aria-label="Open account menu"]');
    if (!button) throw new Error('button not found');
    if (button.disabled) throw new Error('button disabled');
    button.click();
  })()`);
  await until(() => win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="menuitem"]')).some((item) => item.textContent.trim() === ${JSON.stringify(label)})`));
  await win.webContents.executeJavaScript(`(() => {
    const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((candidate) => candidate.textContent.trim() === ${JSON.stringify(label)});
    if (!item) throw new Error('menu item not found');
    item.click();
  })()`);
}

app.whenReady().then(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/renderer.js") {
      response.setHeader("Content-Type", "application/javascript");
      return response.end(fs.readFileSync(path.join(root, ".desktop-test/renderer/renderer.js")));
    }
    response.setHeader("Content-Type", "text/html");
    response.end(request.url === "/desktop-auth" ? "<h1>Desktop auth fixture</h1>" :
      '<html><body><div id="root"></div><script src="/renderer.js"></script></body></html>');
  });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  const origin = `http://localhost:${server.address().port}`;
  win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(desktopSource, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  win.webContents.on("console-message", (event) => { logs.push(event.message); console.log(event.message); });
  const source = fs.readFileSync(path.join(desktopSource, "main.cjs"), "utf8");
  const context = vm.createContext({
    require: (name) => name === "electron" ? { ...electron, app: new Proxy(app, { get: (target, key) => {
      if (key === "isPackaged") return true;
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } }) } : require(name),
    __dirname: path.join(root, "desktop"), process, Buffer, URL, URLSearchParams,
    setTimeout, clearTimeout, console, fetch,
  });
  vm.runInContext(source.slice(0, source.indexOf('_bootstrapLog("INFO", "STAGE: requesting single-instance lock..."')) + `
    globalThis.testApi = {
      configure(origin, window) { serverOrigin = origin; mainWindow = window; registerDesktopAuthIpc(); },
      seed() { desktopAuthToken = 'fixture-access'; desktopRefreshToken = 'fixture-refresh'; desktopTokenExpiration = Date.now()+3600000; if (!saveCredentials()) throw new Error('safeStorage failed'); setupBearerTokenInjection(); },
      state() { return { busy: desktopLogoutInProgress, token: Boolean(desktopAuthToken), refresh: Boolean(desktopRefreshToken), bearer: Boolean(bearerInjectionListener), file: fs.existsSync(getCredentialPath()) }; },
      restore: prepareStoredCredentials,
      stubOAuth() {
        startDesktopOAuthFlow = async ({ mode } = {}) => { globalThis.lastOAuthMode = mode; return true; };
      },
      oauthMode() { return globalThis.lastOAuthMode; },
      authorizationParams() {
        const oldKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
        const oldClient = process.env.CLERK_OAUTH_CLIENT_ID;
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_' + Buffer.from('fixture.clerk.accounts.dev$').toString('base64');
        process.env.CLERK_OAUTH_CLIENT_ID = 'fixture-client';
        try {
          const url = new URL(buildAuthorizationUrl('challenge', 'state'));
          return String(url.searchParams.has('prompt')) + ':' + String(url.searchParams.has('max_age'));
        }
        finally {
          if (oldKey === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = oldKey;
          if (oldClient === undefined) delete process.env.CLERK_OAUTH_CLIENT_ID; else process.env.CLERK_OAUTH_CLIENT_ID = oldClient;
        }
      },
      accountSelectionPath() {
        const oldKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_' + Buffer.from('fixture.clerk.accounts.dev$').toString('base64');
        try {
          const url = new URL(buildAccountSelectionUrl('https://fixture.clerk.accounts.dev/oauth/authorize?state=fixture'));
          return url.hostname + url.pathname + ':' + new URL(url.searchParams.get('redirect_url')).searchParams.get('state');
        }
        finally {
          if (oldKey === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = oldKey;
        }
      },
      externalAuthenticationPath() {
        const oldKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_' + Buffer.from('fixture.clerk.accounts.dev$').toString('base64');
        try {
          const authorizationUrl = buildAuthorizationUrl('challenge', 'state');
          const url = new URL(buildExternalAuthenticationUrl(authorizationUrl));
          return url.hostname + url.pathname + ':' + new URL(url.searchParams.get('redirect_url')).searchParams.get('state');
        }
        finally {
          if (oldKey === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = oldKey;
        }
      },
    };`, context);
  const api = context.testApi;
  api.configure(origin, win);
  assert.equal(typeof session.defaultSession.webRequest.onBeforeSendHeaders.removeListener, "undefined", "D5 used a nonexistent Electron API");
  api.seed();
  await win.loadURL(origin);
  await until(() => win.webContents.executeJavaScript("Boolean(document.querySelector('button'))"));
  assert.equal(await win.webContents.executeJavaScript("typeof window.businessOSDesktop.signOut"), "function");
  assert.equal(await win.webContents.executeJavaScript("typeof window.businessOSDesktop.switchAccount"), "function");
  assert.equal(api.authorizationParams(), "false:false");
  assert.equal(api.accountSelectionPath(), "fixture.accounts.dev/sign-in/choose:fixture");
  assert.equal(api.externalAuthenticationPath(), "fixture.accounts.dev/sign-in/choose:state", "Normal login must use the explicit account-selection boundary");
  await session.defaultSession.cookies.set({ url: origin, name: "businessos_workspace", value: "fixture-a", httpOnly: true });
  await win.webContents.executeJavaScript("localStorage.setItem('draft','fixture'); sessionStorage.setItem('draft','fixture'); window.clerkTestMode='reject'");
  await chooseAccountAction("Sign out");
  await until(() => win.webContents.executeJavaScript("Boolean(document.querySelector('[role=alert]'))"));
  assert.equal(api.state().token, true, "Clerk failure is shown, not silently treated as completed logout");
  await win.webContents.executeJavaScript("window.clerkTestMode='success'");
  const clearStorage = session.defaultSession.clearStorageData.bind(session.defaultSession);
  session.defaultSession.clearStorageData = async () => { throw new Error("fixture storage failure"); };
  await chooseAccountAction("Sign out");
  await until(() => logs.some((line) => line.includes("failed stage=Electron")));
  assert.equal(api.state().busy, false, "Cleanup failure must release logout lock");
  session.defaultSession.clearStorageData = clearStorage;
  api.seed();
  await chooseAccountAction("Sign out");
  await until(() => win.webContents.getURL() === `${origin}/desktop-auth`);
  await until(() => !api.state().busy);
  const state = api.state();
  assert.equal(state.token || state.refresh || state.bearer || state.file, false);
  assert.equal((await session.defaultSession.cookies.get({ url: origin })).length, 0);
  assert.equal(await win.webContents.executeJavaScript("localStorage.length + sessionStorage.length"), 0);
  assert.equal(await api.restore(), false, "Restart cannot restore logged-out account");
  api.seed();
  assert.equal(await api.restore(), true, "Normal account persistence must still work");
  await win.loadURL(origin);
  await until(() => win.webContents.executeJavaScript("Boolean(document.querySelector('button'))"));
  await chooseAccountAction("Sign out");
  await until(() => win.webContents.getURL() === `${origin}/desktop-auth`);
  assert(logs.some((line) => line.includes("action selected=signout")));
  assert(logs.some((line) => line.includes("preload logout invoked")));
  api.seed();
  api.stubOAuth();
  await win.loadURL(origin);
  await until(() => win.webContents.executeJavaScript("Boolean(document.querySelector('button[aria-label=\"Open account menu\"]'))"));
  await chooseAccountAction("Switch account");
  await until(() => api.oauthMode() === "switch-account");
  assert.equal(api.state().token && api.state().refresh && api.state().bearer && api.state().file, true, "Account A remains recoverable until the new OAuth callback succeeds");
  assert(logs.some((line) => line.includes("preload switch-account invoked")));
  console.log("PASS: account menu → Clerk fixture → packaged-compatible preload → sign-out/switch IPC → safeStorage deletion → cookies/storage → desktop-auth or account-select OAuth; retry and persistence verified. No real account or DB used.");
  clearTimeout(deadline);
  server.close();
  win.destroy();
  app.quit();
}).catch((error) => { console.error(error); server?.close(); clearTimeout(deadline); app.exit(1); });
