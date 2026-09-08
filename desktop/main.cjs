"use strict";

const { spawn, execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } = require("electron");

// Development has its own cookies and encrypted credentials. Never restore the
// installed application's account while testing local code.
if (!app.isPackaged) {
  app.setPath("userData", path.resolve(__dirname, "..", ".desktop-dev"));
  process.on("message", (message) => {
    if (message === "desktop:restart") app.quit();
  });
}

// ---------------------------------------------------------------------------
// PHASE 0 — Bootstrap logging
// ---------------------------------------------------------------------------

let _bootstrapLogPath = null;

function _bootstrapLog(level, message) {
  const timestamp = new Date().toISOString();
  const safeMessage = sanitizeDiagnosticText(message);
  const line = `[${timestamp}] [${level}] ${safeMessage}\n`;
  try {
    const userData = app.getPath("userData");
    if (!_bootstrapLogPath) {
      const dir = path.join(userData, "logs");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      _bootstrapLogPath = path.join(dir, "bootstrap.log");
    }
    fs.appendFileSync(_bootstrapLogPath, line, "utf8");
  } catch { /* Last resort */ }
  if (level === "ERROR") {
    console.error(`[BusinessOS:BOOT] ${safeMessage}`);
  } else {
    console.log(`[BusinessOS:BOOT] ${safeMessage}`);
  }
}

_bootstrapLog("INFO", "=== BOOTSTRAP START ===");
try {
  _bootstrapLog("INFO", `app.isPackaged=${app.isPackaged}`);
  _bootstrapLog("INFO", `app.getVersion()=${app.getVersion()}`);
  _bootstrapLog("INFO", `app.getPath("userData")=${app.getPath("userData")}`);
  _bootstrapLog("INFO", `process.resourcesPath=${process.resourcesPath}`);
  _bootstrapLog("INFO", `process.platform=${process.platform}`);
  _bootstrapLog("INFO", `process.arch=${process.arch}`);
} catch (e) {
  console.log(`[BusinessOS:BOOT] Bootstrap metadata error: ${e.message}`);
}

// ---------------------------------------------------------------------------
// Global error handlers
// ---------------------------------------------------------------------------

process.on("uncaughtException", (error) => {
  _bootstrapLog("ERROR", `UNCAUGHT EXCEPTION: ${error.name}: ${error.message}`);
  if (error.stack) {
    const safeLines = error.stack.split("\n").filter((l) => !l.includes("sk_") && !l.includes("DATABASE_URL") && !l.includes("password"));
    _bootstrapLog("ERROR", safeLines.join("\n"));
  }
});

process.on("unhandledRejection", (reason) => {
  if (reason instanceof Error) {
    _bootstrapLog("ERROR", `UNHANDLED REJECTION: ${reason.name}: ${reason.message}`);
    if (reason.stack) {
      const safeLines = reason.stack.split("\n").filter((l) => !l.includes("sk_") && !l.includes("DATABASE_URL") && !l.includes("password"));
      _bootstrapLog("ERROR", safeLines.join("\n"));
    }
  } else {
    _bootstrapLog("ERROR", `UNHANDLED REJECTION: ${String(reason)}`);
  }
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Next 16 normalizes loopback request URLs to localhost in NextURL. Keep the
// OAuth callback on the registered 127.0.0.1 loopback URI, but use localhost
// consistently for the embedded Next server origin so Clerk's middleware
// rewrite remains same-origin and cannot proxy the request back to itself.
const CALLBACK_HOST = "127.0.0.1";
const SERVER_HOST = "localhost";
const SERVER_READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_INITIAL_MS = 250;
const HEALTH_PATH = "/api/health";
const SPLASH_WIDTH = 420;
const SPLASH_HEIGHT = 320;
const MAIN_MIN_WIDTH = 1024;
const MAIN_MIN_HEIGHT = 700;
const MAIN_DEFAULT_WIDTH = 1440;
const MAIN_DEFAULT_HEIGHT = 960;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const OAUTH_CALLBACK_PORT = 49200;
const OAUTH_STATE_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const APP_VERSION = app.getVersion();

const RUNTIME_ENV_KEYS = new Set([
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL",
  "CLERK_OAUTH_CLIENT_ID",
]);

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let serverOrigin = null;
let quitting = false;
let shutdownStarted = false;
let startupFinished = false;
let bearerInjectionListener = null;
let tokenRefreshTimer = null;
let desktopAuthGeneration = 0;
let desktopLogoutInProgress = false;

// ---------------------------------------------------------------------------
// Desktop OAuth state (Electron main process owns everything)
// ---------------------------------------------------------------------------

let desktopAuthState = null;
let desktopAuthToken = null;
let desktopRefreshToken = null;
let desktopTokenExpiration = 0;
let desktopTokenUserId = null;
let desktopOAuthInProgress = false;

function getCredentialPath() {
  return path.join(app.getPath("userData"), "desktop-credentials.bin");
}

function saveCredentials() {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      appendLog("ERROR", "[D4][auth] credentials saved=NO safeStorage unavailable");
      return false;
    }

    const data = JSON.stringify({
      accessToken: desktopAuthToken,
      refreshToken: desktopRefreshToken,
      expiration: desktopTokenExpiration,
      userId: desktopTokenUserId,
    });
    const encrypted = safeStorage.encryptString(data);
    fs.writeFileSync(getCredentialPath(), encrypted);
    appendLog("INFO", "[D4][auth] credentials saved=YES safeStorage=YES");
    return true;
  } catch (e) {
    appendLog("ERROR", `[D4][auth] credentials saved=NO error=${e.message}`);
    return false;
  }
}

function loadCredentials() {
  try {
    const filePath = getCredentialPath();
    if (!fs.existsSync(filePath)) return false;
    if (!safeStorage.isEncryptionAvailable()) {
      appendLog("ERROR", "[D4][auth] credentials loaded=NO safeStorage unavailable");
      return false;
    }

    const raw = safeStorage.decryptString(fs.readFileSync(filePath));
    const data = JSON.parse(raw);
    if (data.accessToken && data.expiration) {
      desktopAuthToken = data.accessToken;
      desktopRefreshToken = data.refreshToken || null;
      desktopTokenExpiration = data.expiration;
      desktopTokenUserId = data.userId || null;
      appendLog("INFO", "[D4][auth] credentials loaded=YES safeStorage=YES");
      return true;
    }
    appendLog("WARN", "[D4][auth] credentials loaded=NO invalid credential payload");
    return false;
  } catch (e) {
    appendLog("ERROR", `[D4][auth] credentials loaded=NO error=${e.message}`);
    return false;
  }
}

function clearCredentials() {
  desktopAuthGeneration += 1;
  clearTokenRefreshTimer();
  disableBearerTokenInjection();
  desktopAuthToken = null;
  desktopRefreshToken = null;
  desktopTokenExpiration = 0;
  desktopTokenUserId = null;
  try {
    const filePath = getCredentialPath();
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    appendLog("INFO", "[D4][auth] encrypted credentials deleted=YES");
  } catch (e) {
    appendLog("ERROR", `[D4][auth] encrypted credentials deleted=NO error=${e.message}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function sanitizeDiagnosticText(value) {
  return String(value)
    .replace(/Bearer\s+(?!(?:enabled=(?:YES|NO)|disabled)\b)[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(access_token|refresh_token|code_verifier|authorization|database_url|clerk_secret_key|password)=?[^\s&]*/gi, "$1=[REDACTED]")
    .replace(/sk_[A-Za-z0-9_-]+/g, "sk_[REDACTED]");
}

function logWindowInventory(event) {
  try {
    const windows = BrowserWindow.getAllWindows();
    const ids = windows.map((window) => window.id).join(",") || "none";
    appendLog("INFO", `[D4][windows] ${event} all window count=${windows.length} ids=${ids}`);
  } catch (error) {
    appendLog("WARN", `[D4][windows] ${event} inventory unavailable error=${error.message}`);
  }
}

function ensureLogDir() {
  const dir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function appendLog(level, message) {
  const timestamp = new Date().toISOString();
  const safeMessage = sanitizeDiagnosticText(message);
  const line = `[${timestamp}] [${level}] ${safeMessage}\n`;
  try {
    fs.appendFileSync(path.join(ensureLogDir(), "desktop.log"), line, "utf8");
  } catch { /* Best effort */ }
  if (level === "ERROR") {
    console.error(`[BusinessOS] ${safeMessage}`);
  } else {
    console.log(`[BusinessOS] ${safeMessage}`);
  }
}

// ---------------------------------------------------------------------------
// Environment / secrets
// ---------------------------------------------------------------------------

function parseRuntimeEnv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || !RUNTIME_ENV_KEYS.has(match[1])) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function loadPackagedRuntimeEnv() {
  const configPath = path.join(app.getPath("userData"), "runtime.env");
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Desktop configuration is missing.\n\n` +
        `Please create the file:\n${configPath}\n\n` +
        `Required variables:\n` +
        `  DATABASE_URL=postgresql://...\n` +
        `  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...\n` +
        `  CLERK_SECRET_KEY=sk_...\n` +
        `  CLERK_OAUTH_CLIENT_ID=...\n\n` +
        `You can copy these from your .env.local file.`
    );
  }
  const values = parseRuntimeEnv(fs.readFileSync(configPath, "utf8"));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  const missing = ["DATABASE_URL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "CLERK_OAUTH_CLIENT_ID"].filter(
    (key) => !process.env[key]
  );
  if (missing.length) {
    throw new Error(
      `Desktop configuration is missing required variables: ${missing.join(", ")}\n\n` +
        `Please edit:\n${configPath}`
    );
  }
  appendLog("INFO", `Loaded runtime.env with ${Object.keys(values).length} variables`);
}

// ---------------------------------------------------------------------------
// Port management
// ---------------------------------------------------------------------------

function reserveAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen({ host: SERVER_HOST, port: 0, exclusive: true }, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : null;
      probe.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error("Could not reserve a local port."));
      });
    });
  });
}

function isPortAvailable(port, host = SERVER_HOST) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen({ host, port }, () => {
      probe.close(() => resolve(true));
    });
  });
}

// ---------------------------------------------------------------------------
// Next.js server process
// ---------------------------------------------------------------------------

function buildPackagedEnv(port) {
  return {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: SERVER_HOST,
    PORT: String(port),
    ELECTRON_RUN_AS_NODE: "1",
  };
}

function buildDevEnv(port) {
  return {
    ...process.env,
    NODE_ENV: "development",
    HOSTNAME: SERVER_HOST,
    PORT: String(port),
  };
}

function spawnPackagedServer(port) {
  const serverRoot = path.join(process.resourcesPath, "next");
  const serverEntry = path.join(serverRoot, "server.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Packaged Next.js server is missing at: ${serverEntry}`);
  }

  const env = buildPackagedEnv(port);
  appendLog("INFO", `Packaged server entry: ${serverEntry}`);

  try {
    const child = execFile(process.execPath, [serverEntry], {
      cwd: serverRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    appendLog("INFO", "execFile spawn succeeded");
    return child;
  } catch (primaryError) {
    appendLog("WARN", `execFile failed (${primaryError.code}: ${primaryError.message}), trying spawn+shell fallback`);
  }

  try {
    const child = spawn(process.execPath, [serverEntry], {
      cwd: serverRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      windowsHide: true,
    });
    appendLog("INFO", "spawn+shell fallback succeeded");
    return child;
  } catch (fallbackError) {
    appendLog("ERROR", `spawn+shell also failed: ${fallbackError.code}: ${fallbackError.message}`);
    throw new Error(
      `Failed to start the local server.\n\n` +
        `Attempted: execFile and spawn+shell.\n` +
        `Last error: ${fallbackError.message}\n\n` +
        `Server entry: ${serverEntry}\n` +
        `CWD: ${serverRoot}`
    );
  }
}

function spawnDevServer(port) {
  const cwd = path.resolve(__dirname, "..");
  const env = buildDevEnv(port);
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  appendLog("INFO", `Dev server: ${npmCommand} in ${cwd}`);

  return spawn(npmCommand, ["run", "dev", "--", "--hostname", SERVER_HOST, "--port", String(port)], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false,
  });
}

function spawnNextServer(port) {
  return app.isPackaged ? spawnPackagedServer(port) : spawnDevServer(port);
}

// ---------------------------------------------------------------------------
// Server readiness polling via /api/health
// ---------------------------------------------------------------------------

function waitForServer(child, origin) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let pollInterval = POLL_INTERVAL_INITIAL_MS;
  let attempt = 0;

  appendLog("INFO", `Health probe started: ${origin}${HEALTH_PATH}`);

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve();
    };

    const onExit = (code) => finish(new Error(`Local server exited before startup (exit code ${code ?? "unknown"}).`));
    child.once("exit", onExit);

    const poll = () => {
      if (settled) return;
      attempt += 1;

      if (Date.now() >= deadline) {
        finish(new Error(`Health probe timed out after ${SERVER_READY_TIMEOUT_MS / 1000}s.`));
        return;
      }

      const request = http.get(`${origin}${HEALTH_PATH}`, (response) => {
        response.resume();
        appendLog("INFO", `Health attempt #${attempt} — HTTP ${response.statusCode}`);
        if (response.statusCode === 200) {
          appendLog("INFO", "Server readiness confirmed");
          finish();
        } else {
          setTimeout(poll, pollInterval);
        }
      });
      request.setTimeout(2_000, () => request.destroy());
      request.on("error", () => {
        setTimeout(poll, pollInterval);
      });
    };

    poll();
  });
}

// ---------------------------------------------------------------------------
// Server start / stop
// ---------------------------------------------------------------------------

async function startLocalServer() {
  if (!app.isPackaged && process.env.BUSINESSOS_DEV_ORIGIN) {
    const origin = new URL(process.env.BUSINESSOS_DEV_ORIGIN);
    if (origin.protocol !== "http:" || origin.hostname !== SERVER_HOST) {
      throw new Error("Desktop development requires an http://localhost origin");
    }
    serverOrigin = origin.origin;
    appendLog("INFO", `[D6][dev] using launcher-owned Next server ${serverOrigin}`);
    return;
  }
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    appendLog("INFO", `Server start attempt ${attempt + 1}/3`);
    const port = await reserveAvailablePort();
    const origin = `http://${SERVER_HOST}:${port}`;
    appendLog("INFO", `Reserved port ${port}`);

    let child;
    try {
      child = spawnNextServer(port);
    } catch (spawnError) {
      lastError = spawnError;
      appendLog("ERROR", `Spawn failed on attempt ${attempt + 1}: ${spawnError.message}`);
      continue;
    }

    child.stdout?.on("data", (chunk) => appendLog("INFO", `[next] ${String(chunk).trimEnd()}`));
    child.stderr?.on("data", (chunk) => appendLog("WARN", `[next] ${String(chunk).trimEnd()}`));

    child.on("error", (err) => {
      appendLog("ERROR", `Server child process error: ${err.code} - ${err.message}`);
    });

    try {
      await waitForServer(child, origin);
      serverProcess = child;
      serverOrigin = origin;
      child.once("exit", (code) => {
        appendLog("ERROR", `Server exited unexpectedly (code ${code ?? "unknown"})`);
        if (!quitting) {
          dialog.showErrorBox(
            "BusinessOS server stopped",
            `The local server exited unexpectedly (code ${code ?? "unknown"}).\nThe application will close.`
          );
          app.quit();
        }
      });
      appendLog("INFO", `Server running at ${origin}`);
      return;
    } catch (error) {
      lastError = error;
      appendLog("ERROR", `Attempt ${attempt + 1} failed: ${error.message}`);
      try { child.kill(); } catch { /* ignore */ }
      await new Promise((r) => child.once("exit", r)).catch(() => {});
    }
  }

  throw lastError ?? new Error("Could not start the local BusinessOS server after 3 attempts.");
}

function stopLocalServer() {
  if (!serverProcess?.pid) return Promise.resolve();
  const child = serverProcess;
  const pid = child.pid;
  serverProcess = null;
  appendLog("INFO", `Stopping server (PID ${pid})`);

  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
    killer.once("exit", () => {
      clearTimeout(timer);
      appendLog("INFO", `Server stopped (PID ${pid})`);
      resolve();
    });
    killer.once("error", () => {
      clearTimeout(timer);
      try { child.kill(); } catch { /* ignore */ }
      appendLog("WARN", "taskkill failed, fell back to child.kill()");
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Desktop OAuth — PKCE + one-shot callback listener
// ---------------------------------------------------------------------------

function generatePkceParams() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  return { codeVerifier, codeChallenge, state };
}

function getFapiUrl() {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  const prefixMatch = /^pk_(test|live)_/.exec(pk);
  if (!prefixMatch) throw new Error("Invalid NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY format");
  const encoded = pk.slice(prefixMatch[0].length);
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const hostname = decoded.replace(/\$$/, "");
  if (!hostname.endsWith(".clerk.accounts.dev")) {
    throw new Error("Decoded Clerk hostname does not end with .clerk.accounts.dev");
  }
  return `https://${hostname}`;
}

function buildAuthorizationUrl(codeChallenge, state) {
  const fapiUrl = getFapiUrl();
  const clientId = process.env.CLERK_OAUTH_CLIENT_ID;
  const callbackUrl = `http://${CALLBACK_HOST}:${OAUTH_CALLBACK_PORT}/desktop-auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: state,
    scope: "profile email",
  });
  return `${fapiUrl}/oauth/authorize?${params.toString()}`;
}

function exchangeCodeForTokens(code, codeVerifier) {
  const fapiUrl = getFapiUrl();
  const clientId = process.env.CLERK_OAUTH_CLIENT_ID;
  const callbackUrl = `http://${CALLBACK_HOST}:${OAUTH_CALLBACK_PORT}/desktop-auth/callback`;

  return fetch(`${fapiUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: callbackUrl,
      client_id: clientId,
      code_verifier: codeVerifier,
    }).toString(),
  }).then(async (res) => {
    appendLog("INFO", `[D4][oauth] token exchange status=${res.status} ok=${res.ok ? "YES" : "NO"}`);
    const body = await res.json();
    appendLog("INFO", `[D4][oauth] access token received=${body.access_token ? "YES" : "NO"} refresh token received=${body.refresh_token ? "YES" : "NO"}`);
    if (!res.ok) {
      throw new Error(`Token exchange failed with HTTP ${res.status}`);
    }
    return body;
  });
}

function refreshAccessToken() {
  if (!desktopRefreshToken) return Promise.reject(new Error("No refresh token"));

  const fapiUrl = getFapiUrl();
  const clientId = process.env.CLERK_OAUTH_CLIENT_ID;

  return fetch(`${fapiUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: desktopRefreshToken,
      client_id: clientId,
    }).toString(),
  }).then(async (res) => {
    appendLog("INFO", `[D4][oauth] token refresh status=${res.status} ok=${res.ok ? "YES" : "NO"}`);
    const body = await res.json();
    appendLog("INFO", `[D4][oauth] refreshed access token received=${body.access_token ? "YES" : "NO"} refresh token received=${body.refresh_token ? "YES" : "NO"}`);
    if (!res.ok) {
      throw new Error(`Token refresh failed with HTTP ${res.status}`);
    }
    return body;
  });
}

async function getOAuthUserId(accessToken = desktopAuthToken) {
  if (!accessToken) throw new Error("No desktop access token is available");
  const response = await fetch(`${getFapiUrl()}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`OAuth userinfo failed with HTTP ${response.status}`);
  const userInfo = await response.json();
  if (!userInfo.sub) throw new Error("OAuth userinfo did not return a user ID");
  return userInfo.sub;
}

function buildAccountSelectionUrl(authorizationUrl) {
  const fapiUrl = new URL(getFapiUrl());
  const accountPortalHost = fapiUrl.hostname.replace(".clerk.accounts.dev", ".accounts.dev");
  const accountSelectionUrl = new URL(`https://${accountPortalHost}/sign-in/choose`);
  accountSelectionUrl.searchParams.set("redirect_url", authorizationUrl);
  return accountSelectionUrl.toString();
}

function startOAuthCallbackListener(codeVerifier, state, mode) {
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  let closeListener;
  const result = new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    let server;

    const complete = (error, value) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      try { server.close(); } catch { /* already closed */ }
      if (error) reject(error);
      else resolve(value);
    };
    closeListener = () => complete(new Error("OAuth callback listener closed"));

    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${CALLBACK_HOST}:${OAUTH_CALLBACK_PORT}`);

      if (url.pathname !== "/desktop-auth/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const stateValid = returnedState === state;

      appendLog("INFO", `[D4][oauth] callback received code present=${code ? "YES" : "NO"} state valid=${stateValid ? "YES" : "NO"} error present=${error ? "YES" : "NO"}`);

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<html><body><h2>Authentication failed</h2><p>You can close this tab.</p></body></html>`);
        complete(new Error("OAuth provider returned an error"));
        return;
      }

      if (!code || !stateValid) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<html><body><h2>Authentication failed</h2><p>Invalid state or missing code.</p><p>You can close this tab.</p></body></html>`);
        complete(new Error("Invalid state or missing authorization code"));
        return;
      }

      appendLog("INFO", "[D4][oauth] token exchange started");

      exchangeCodeForTokens(code, codeVerifier)
        .then(async (tokenData) => {
          const authenticatedUserId = await getOAuthUserId(tokenData.access_token);
          if (mode === "switch-account") {
            appendLog("INFO", "[SWITCH] callback received");
            await clearDesktopAuthenticationState();
            appendLog("INFO", "[SWITCH] Account A desktop state cleared");
          }
          desktopAuthToken = tokenData.access_token;
          desktopRefreshToken = tokenData.refresh_token || null;
          desktopTokenExpiration = Date.now() + ((tokenData.expires_in || 86400) * 1000);
          desktopTokenUserId = authenticatedUserId;
          appendLog("INFO", `[D4][oauth] in-memory auth state set access token=${desktopAuthToken ? "YES" : "NO"} refresh token=${desktopRefreshToken ? "YES" : "NO"}`);

          if (!saveCredentials()) {
            throw new Error("Encrypted desktop credentials could not be saved");
          }
          if (!setupBearerTokenInjection()) {
            throw new Error("Bearer injection could not be enabled");
          }
          if (mode === "switch-account") appendLog("INFO", "[SWITCH] Account B credentials installed");

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<!DOCTYPE html>
<html><head><title>BusinessOS — Authenticated</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#f8fafc;">
<div style="text-align:center;">
<h1 style="font-size:24px;margin-bottom:16px;">Sign-in Successful</h1>
<p style="color:#94a3b8;">You can return to BusinessOS.</p>
<p style="color:#64748b;font-size:14px;margin-top:8px;">This window will close automatically.</p>
</div>
<script>setTimeout(()=>window.close(),3000);</script>
</body></html>`);

          appendLog("INFO", "[D4][oauth] callback handoff ready credentials saved=YES Bearer enabled=YES");
          complete(null, tokenData);
        })
        .catch((err) => {
          appendLog("ERROR", `[D4][oauth] token exchange failed error=${err.message}`);
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`<html><body><h2>Authentication failed</h2><p>You can close this tab.</p></body></html>`);
          complete(err);
        });
    });

    server.on("error", (err) => {
      appendLog("ERROR", `[D4][oauth] callback listener error=${err.message}`);
      rejectReady(err);
      complete(err);
    });

    server.listen(OAUTH_CALLBACK_PORT, CALLBACK_HOST, () => {
      appendLog("INFO", `[D4][oauth] callback listener started port=${OAUTH_CALLBACK_PORT}`);
      resolveReady();
    });

    timeoutId = setTimeout(() => {
      appendLog("ERROR", "[D4][oauth] callback timed out");
      complete(new Error("OAuth callback timed out"));
    }, OAUTH_STATE_TIMEOUT_MS);
  });
  return { ready, result, close: () => closeListener?.() };
}

async function startDesktopOAuthFlow({ mode = "normal-login" } = {}) {
  if (desktopOAuthInProgress) {
    appendLog("WARN", "[debug] startDesktopOAuthFlow called while already in progress — ignoring");
    return false;
  }
  desktopOAuthInProgress = true;
  appendLog("INFO", "[debug] startDesktopOAuthFlow entered");

  appendLog("INFO", `[D4][oauth] OAuth start current mainWindow URL=${mainWindow?.webContents.getURL() || "unknown"}`);

  let available;
  try {
    available = await isPortAvailable(OAUTH_CALLBACK_PORT, CALLBACK_HOST);
  } catch (error) {
    appendLog("ERROR", `[D4][oauth] callback port check failed error=${error.message}`);
    desktopOAuthInProgress = false;
    return false;
  }
  appendLog("INFO", `[D4][oauth] callback port available=${available ? "YES" : "NO"}`);
  if (!available) {
    dialog.showErrorBox(
      "Port unavailable",
      `Port ${OAUTH_CALLBACK_PORT} is required for desktop authentication but is currently in use.\n\nPlease close the other application using this port and try again.`
    );
    desktopOAuthInProgress = false;
    return false;
  }

  const { codeVerifier, codeChallenge, state } = generatePkceParams();
  desktopAuthState = state;
  appendLog("INFO", "[D4][oauth] PKCE state generated");

  let authUrl;
  try {
    authUrl = buildAuthorizationUrl(codeChallenge, state);
    appendLog("INFO", `[D4][oauth] authorization URL built length=${authUrl.length}`);
  } catch (err) {
    appendLog("ERROR", `[debug] buildAuthorizationUrl failed: ${err.message}`);
    desktopAuthState = null;
    desktopOAuthInProgress = false;
    return false;
  }

  const externalAuthUrl = mode === "switch-account" ? buildAccountSelectionUrl(authUrl) : authUrl;
  const listener = startOAuthCallbackListener(codeVerifier, state, mode);
  try {
    await listener.ready;
  } catch (err) {
    appendLog("ERROR", `[D4][oauth] callback listener startup failed error=${err.message}`);
    desktopAuthState = null;
    desktopOAuthInProgress = false;
    return false;
  }

  appendLog("INFO", "[D4][oauth] opening system browser");
  try {
    await shell.openExternal(externalAuthUrl);
    appendLog("INFO", "[D4][oauth] system browser opened");
  } catch (err) {
    appendLog("ERROR", `[D4][oauth] system browser open failed error=${err.message}`);
    listener.close();
    await listener.result.catch(() => {});
    desktopAuthState = null;
    desktopOAuthInProgress = false;
    return false;
  }

  try {
    await listener.result;
    appendLog("INFO", `[D4][oauth] navigation target after auth=${serverOrigin}/`);
    appendLog("INFO", "Desktop OAuth flow completed successfully — navigating to dashboard");

    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(`${serverOrigin}/`);
      appendLog("INFO", `[D4][oauth] mainWindow URL after auth=${mainWindow.webContents.getURL()}`);
      if (mode === "switch-account") appendLog("INFO", "[SWITCH] Account B dashboard loaded");
    }
    return true;
  } catch (err) {
    appendLog("ERROR", `[D4][oauth] OAuth flow failed error=${err.message}`);
    desktopAuthState = null;
    return false;
  } finally {
    desktopOAuthInProgress = false;
  }
}

async function clearDesktopAuthenticationState() {
  const credentialsCleared = clearCredentials();
  if (!credentialsCleared) throw new Error("Encrypted credentials could not be deleted. Close other BusinessOS instances and retry.");
  desktopAuthState = null;
  const storageCleared = await clearElectronAuthStorage();
  if (!storageCleared) throw new Error("Desktop storage could not be cleared. Please retry.");
}

async function clearElectronAuthStorage() {
  if (!serverOrigin) {
    appendLog("ERROR", "[D5][logout] Electron cookies cleared=NO server origin unavailable");
    return false;
  }

  try {
    await session.defaultSession.clearStorageData({
      origin: serverOrigin,
      storages: ["cookies", "localstorage", "indexdb", "serviceworkers", "cachestorage", "filesystem", "shadercache"],
    });
    appendLog("INFO", "[D5][logout] Electron cookies cleared=YES");
    appendLog("INFO", "[D5][logout] workspace cookie cleared=YES");
    appendLog("INFO", "[D5][logout] renderer storage cleared=YES");
    await session.defaultSession.cookies.flushStore();
    appendLog("INFO", "[D6][logout] storage cleanup completed");
    return true;
  } catch (error) {
    appendLog("ERROR", `[D5][logout] Electron cookies cleared=NO error=${error.message}`);
    return false;
  }
}

async function handleDesktopSignOut() {
  if (desktopLogoutInProgress) {
    appendLog("INFO", "[D5][logout] logout request ignored while cleanup is already running");
    return false;
  }
  desktopLogoutInProgress = true;
  appendLog("INFO", "[D5][logout] logout requested");
  appendLog("INFO", `[D4][auth] sign out current mainWindow URL=${mainWindow?.webContents.getURL() || "unknown"}`);
  appendLog("INFO", "Desktop sign out — clearing credentials");

  try {
    await clearDesktopAuthenticationState();
    appendLog("INFO", "[D6][logout] credentials deleted");
    appendLog("INFO", "[D5][logout] persisted token deleted=YES");

    appendLog("INFO", `[D6][logout] local credentials present=${desktopAuthToken || desktopRefreshToken ? "YES" : "NO"}`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      const target = `${serverOrigin}/desktop-auth`;
      appendLog("INFO", "[D6][logout] navigating to desktop-auth");
      await mainWindow.loadURL(target);
      mainWindow.webContents.navigationHistory.clear();
      appendLog("INFO", "[D6][logout] completed");
      appendLog("INFO", `[D5][logout] navigation to /desktop-auth complete target=${target}`);
      appendLog("INFO", `[D4][auth] sign out navigation target=${target} current=${mainWindow.webContents.getURL()}`);
    }
  } catch (error) {
    appendLog("ERROR", `[D6][logout] failed stage=main name=${error.name}`);
    throw error;
  } finally {
    desktopLogoutInProgress = false;
  }
  return true;
}

async function handleDesktopSwitchAccount() {
  appendLog("INFO", "[SWITCH] account switch requested");
  appendLog("INFO", "[SWITCH] opening Clerk multi-session account chooser");
  return startDesktopOAuthFlow({ mode: "switch-account" });
}

// ---------------------------------------------------------------------------
// Bearer token injection (only to current BusinessOS origin)
// ---------------------------------------------------------------------------

function disableBearerTokenInjection() {
  if (bearerInjectionListener) {
    session.defaultSession.webRequest.onBeforeSendHeaders(null);
    bearerInjectionListener = null;
  }
  appendLog("INFO", "[D4][auth] Bearer enabled=NO");
  appendLog("INFO", "[D6][logout] Bearer disabled");
}

function setupBearerTokenInjection() {
  if (!serverOrigin || !desktopAuthToken) {
    appendLog("ERROR", "[D4][auth] Bearer enabled=NO missing server origin or access token");
    return false;
  }

  disableBearerTokenInjection();
  bearerInjectionListener = (details, callback) => {
    const hasToken = Boolean(desktopAuthToken);
    if (hasToken) {
      details.requestHeaders.Authorization = `Bearer ${desktopAuthToken}`;
    }
    let pathname = "unknown";
    try { pathname = new URL(details.url).pathname; } catch { /* safe diagnostic only */ }
    appendLog("INFO", `[D4][auth] Authorization header attached=${hasToken ? "YES" : "NO"} path=${pathname}`);
    callback({ requestHeaders: details.requestHeaders });
  };
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`${serverOrigin}/*`] },
    bearerInjectionListener,
  );
  appendLog("INFO", "[D4][auth] Bearer enabled=YES");
  return true;
}

function registerDesktopAuthIpc() {
  ipcMain.on("desktop-auth:start", () => { void startDesktopOAuthFlow(); });
  ipcMain.handle("desktop-auth:signout", async (event) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame?.url && new URL(event.senderFrame.url).origin !== serverOrigin) {
      throw new Error("Logout is only available to the BusinessOS main window");
    }
    appendLog("INFO", "[D6][logout] IPC received");
    return handleDesktopSignOut();
  });
  ipcMain.handle("desktop-auth:switch-account", async (event) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame?.url && new URL(event.senderFrame.url).origin !== serverOrigin) {
      throw new Error("Account switching is only available to the BusinessOS main window");
    }
    appendLog("INFO", "[D7][account] switch-account IPC received");
    return handleDesktopSwitchAccount();
  });
  ipcMain.handle("app:version", () => APP_VERSION);
}

// ---------------------------------------------------------------------------
// Token refresh scheduler
// ---------------------------------------------------------------------------

function scheduleTokenRefresh() {
  clearTokenRefreshTimer();
  if (!desktopAuthToken || !desktopRefreshToken) return;

  const timeUntilRefresh = desktopTokenExpiration - Date.now() - TOKEN_REFRESH_BUFFER_MS;
  if (timeUntilRefresh <= 0) {
    void performTokenRefresh();
    return;
  }

  appendLog("INFO", `[D4][auth] token refresh scheduled in ${Math.round(timeUntilRefresh / 1000)}s`);
  tokenRefreshTimer = setTimeout(() => {
    if (!quitting) void performTokenRefresh();
  }, timeUntilRefresh);
}

function clearTokenRefreshTimer() {
  if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
  tokenRefreshTimer = null;
}

async function performTokenRefresh({ duringStartup = false } = {}) {
  if (quitting) return false;
  if (desktopLogoutInProgress) {
    appendLog("INFO", "[D5][logout] token refresh skipped while logout is running");
    return false;
  }
  if (!desktopRefreshToken) {
    appendLog("ERROR", "[D4][auth] token refresh failed error=no refresh token");
    clearCredentials();
    return false;
  }
  appendLog("INFO", "[D4][auth] token refresh started");
  const refreshGeneration = desktopAuthGeneration;

  try {
    const tokenData = await refreshAccessToken();
    if (desktopLogoutInProgress || refreshGeneration !== desktopAuthGeneration) {
      appendLog("INFO", "[D5][logout] token refresh result ignored after logout");
      return false;
    }
    desktopAuthToken = tokenData.access_token;
    desktopRefreshToken = tokenData.refresh_token || desktopRefreshToken;
    desktopTokenExpiration = Date.now() + ((tokenData.expires_in || 86400) * 1000);

    if (!saveCredentials()) throw new Error("Encrypted desktop credentials could not be saved after refresh");
    appendLog("INFO", "[D4][auth] token refresh succeeded");
    scheduleTokenRefresh();
    return true;
  } catch (err) {
    if (refreshGeneration !== desktopAuthGeneration) return false;
    appendLog("ERROR", `[D4][auth] token refresh failed error=${err.message}`);
    clearCredentials();
    if (!duringStartup && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Session expired",
        message: "Your session has expired. Please sign in again.",
      }).then(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(`${serverOrigin}/desktop-auth`);
        }
      });
    }
    return false;
  }
}

async function prepareStoredCredentials() {
  appendLog("INFO", "[D5][auth] startup token restore attempted");
  if (!loadCredentials()) {
    appendLog("INFO", "[D5][auth] startup token restore skipped reason=no persisted credentials");
    return false;
  }
  if (desktopTokenExpiration > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    appendLog("INFO", "[D4][auth] stored credentials valid=YES");
    return true;
  }
  appendLog("INFO", "[D4][auth] stored access token needs refresh");
  return performTokenRefresh({ duringStartup: true });
}

// ---------------------------------------------------------------------------
// Splash screen
// ---------------------------------------------------------------------------

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    closable: true,
    show: false,
    center: true,
    title: "BusinessOS",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const createdSplash = splashWindow;
  appendLog("INFO", `[D4][windows] splash created ID=${createdSplash.id}`);
  createdSplash.on("closed", () => {
    appendLog("INFO", `[D4][windows] splash closed ID=${createdSplash.id}`);
    if (splashWindow === createdSplash) splashWindow = null;
    logWindowInventory("after splash closed");
  });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f172a;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    -webkit-app-region: drag;
    user-select: none;
  }
  .logo { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 24px; }
  .status { font-size: 14px; color: #94a3b8; margin-bottom: 20px; }
  .spinner {
    width: 28px; height: 28px;
    border: 3px solid #1e293b; border-top-color: #3b82f6;
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="logo">BusinessOS</div>
  <div class="status">Starting...</div>
  <div class="spinner"></div>
</body>
</html>`;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splashWindow.once("ready-to-show", () => {
    if (!splashWindow || splashWindow.isDestroyed()) return;
    splashWindow.show();
    appendLog("INFO", `[D4][windows] splash shown ID=${splashWindow.id}`);
    logWindowInventory("after splash shown");
  });
}

function closeSplashWindow() {
  if (!splashWindow) return;
  const splashId = splashWindow.id;
  appendLog("INFO", `[D4][windows] splash close/destroy requested ID=${splashId}`);
  try {
    if (!splashWindow.isDestroyed()) splashWindow.destroy();
  } catch (error) {
    appendLog("WARN", `[D4][windows] splash destroy error=${error.message}`);
  }
  splashWindow = null;
  appendLog("INFO", `[D4][windows] splash destroyed ID=${splashId}`);
  logWindowInventory("after splash destroy");
}

function finishStartup(reason) {
  appendLog("INFO", `[D4][windows] finishStartup called reason=${reason} alreadyFinished=${startupFinished ? "YES" : "NO"}`);
  if (startupFinished) return;
  startupFinished = true;

  closeSplashWindow();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    appendLog("INFO", `[D4][windows] main shown ID=${mainWindow.id}`);
  }
  logWindowInventory("after finishStartup");
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: MAIN_DEFAULT_WIDTH,
    height: MAIN_DEFAULT_HEIGHT,
    minWidth: MAIN_MIN_WIDTH,
    minHeight: MAIN_MIN_HEIGHT,
    show: false,
    title: "BusinessOS",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  appendLog("INFO", `[D4][windows] main created ID=${mainWindow.id} hidden=YES`);
  logWindowInventory("after main created");

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    appendLog("INFO", `[debug] setWindowOpenHandler fired url=${url}`);
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    let parsed;
    try { parsed = new URL(url); } catch { return; }
    appendLog("INFO", `[debug] will-navigate fired url=${url} origin=${parsed.origin} pathname=${parsed.pathname} originMatch=${parsed.origin === serverOrigin}`);
    try {
      if (parsed.origin === serverOrigin) {
        if (parsed.pathname === "/desktop-auth/start") {
          appendLog("INFO", "[debug] will-navigate matched /desktop-auth/start — calling startDesktopOAuthFlow");
          event.preventDefault();
          void startDesktopOAuthFlow();
          return;
        }
        if (parsed.pathname === "/desktop-auth/signout") {
          event.preventDefault();
          void handleDesktopSignOut();
          return;
        }
        return;
      }
    } catch { /* invalid URL — block */ }
    event.preventDefault();
    if (url.startsWith("https://")) void shell.openExternal(url);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const prefix = ["VERBOSE", "INFO", "WARNING", "ERROR"][level] ?? "LOG";
    appendLog(level >= 2 ? "WARN" : "INFO", `[renderer] [${prefix}] ${message}${sourceId ? ` (${sourceId}:${line})` : ""}`);
  });

  mainWindow.webContents.once("did-finish-load", () => {
    appendLog("INFO", `[D4][windows] main ready ID=${mainWindow?.id ?? "unknown"} URL=${mainWindow?.webContents.getURL() || "unknown"}`);
    finishStartup("did-finish-load");
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      appendLog("ERROR", `[D4][windows] main page load failed code=${errorCode} description=${errorDescription} URL=${validatedURL}`);
    }
  });

  mainWindow.once("ready-to-show", () => {
    clearTimeout(loadTimer);
    appendLog("INFO", `[D4][windows] main ready-to-show ID=${mainWindow?.id ?? "unknown"}`);
    finishStartup("ready-to-show");
  });

  const MAIN_LOAD_TIMEOUT_MS = 15_000;
  const loadTimer = setTimeout(() => {
    appendLog("WARN", `[D4][windows] main initial page not ready after ${MAIN_LOAD_TIMEOUT_MS / 1000}s`);
  }, MAIN_LOAD_TIMEOUT_MS);

  mainWindow.on("closed", () => {
    clearTimeout(loadTimer);
    appendLog("INFO", `[D4][windows] main closed ID=${mainWindow?.id ?? "unknown"}`);
    mainWindow = null;
    logWindowInventory("after main closed");
  });

  appendLog("INFO", `[D4][windows] main loading initial URL=${serverOrigin}/`);
  void mainWindow.loadURL(`${serverOrigin}/`);
}

// ---------------------------------------------------------------------------
// Application entry
// ---------------------------------------------------------------------------

_bootstrapLog("INFO", "STAGE: requesting single-instance lock...");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
_bootstrapLog("INFO", `STAGE: single-instance lock result=${hasSingleInstanceLock}`);

if (!hasSingleInstanceLock) {
  _bootstrapLog("WARN", "Another BusinessOS instance is already running. Quitting.");
  app.quit();
} else {
  app.on("second-instance", () => {
    appendLog("INFO", "Second instance detected — restoring main window");
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    logWindowInventory("after second-instance focus");
  });

  _bootstrapLog("INFO", "STAGE: waiting for app.whenReady()...");
  app.whenReady().then(async () => {
    appendLog("INFO", "STAGE: app.whenReady() resolved");
    try {
      appendLog("INFO", `BusinessOS starting (packaged=${app.isPackaged})`);

      appendLog("INFO", "STAGE: runtime.env lookup...");
      const configPath = path.join(app.getPath("userData"), "runtime.env");
      const configExists = fs.existsSync(configPath);
      appendLog("INFO", `STAGE: runtime.env exists=${configExists} (path=${configPath})`);

      if (app.isPackaged) {
        appendLog("INFO", "STAGE: loading packaged runtime.env...");
        loadPackagedRuntimeEnv();
        appendLog("INFO", "STAGE: packaged runtime.env loaded");
      } else {
        appendLog("INFO", "STAGE: dev mode — skipping runtime.env");
      }

      appendLog("INFO", "STAGE: creating splash window...");
      createSplashWindow();

      appendLog("INFO", "STAGE: loading desktop credentials...");
      const storedCredentialsReady = await prepareStoredCredentials();
      appendLog("INFO", `[D4][auth] stored credentials ready=${storedCredentialsReady ? "YES" : "NO"}`);

      appendLog("INFO", "STAGE: setting permission handler...");
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

      registerDesktopAuthIpc();

      appendLog("INFO", "STAGE: verifying installed resources...");
      if (app.isPackaged) {
        const serverRoot = path.join(process.resourcesPath, "next");
        const serverEntry = path.join(serverRoot, "server.js");
        appendLog("INFO", `STAGE: serverRoot=${serverRoot}`);
        appendLog("INFO", `STAGE: server.js exists=${fs.existsSync(serverEntry)}`);
        appendLog("INFO", `STAGE: node_modules exists=${fs.existsSync(path.join(serverRoot, "node_modules"))}`);
      }

      appendLog("INFO", "STAGE: starting local server...");
      await startLocalServer();
      appendLog("INFO", "STAGE: local server started");

      if (storedCredentialsReady) {
        setupBearerTokenInjection();
        scheduleTokenRefresh();
      }

      appendLog("INFO", "STAGE: creating main window...");
      createMainWindow();
      if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: "right" });
      appendLog("INFO", "STAGE: main window created — startup complete");
    } catch (error) {
      closeSplashWindow();
      const message = error instanceof Error ? error.message : "Unknown startup error.";
      appendLog("ERROR", `STAGE: STARTUP FAILED: ${message}`);
      if (error instanceof Error && error.stack) appendLog("ERROR", error.stack);
      try {
        dialog.showErrorBox(
          "BusinessOS could not start",
          `The local application server failed to launch.\n\n${message}\n\nCheck the desktop log for details:\n${path.join(app.getPath("userData"), "logs", "desktop.log")}`
        );
      } catch (dialogErr) {
        appendLog("ERROR", `Could not show error dialog: ${dialogErr.message}`);
      }
      app.quit();
    }
  }).catch((err) => {
    _bootstrapLog("ERROR", `app.whenReady() rejected: ${err.name}: ${err.message}`);
    if (err.stack) _bootstrapLog("ERROR", err.stack);
    app.quit();
  });

  app.on("window-all-closed", () => app.quit());

  app.on("before-quit", (event) => {
    quitting = true;
    appendLog("INFO", "STAGE: before-quit fired");
    if (!serverProcess || shutdownStarted) return;
    event.preventDefault();
    shutdownStarted = true;
    void stopLocalServer().finally(() => app.quit());
  });
}
