"use strict";

const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { app, BrowserWindow, dialog, session, shell } = require("electron");

// ---------------------------------------------------------------------------
// PHASE 0 — Bootstrap logging (runs BEFORE everything else)
// ---------------------------------------------------------------------------
// All other code depends on this.  Writes to bootstrap.log immediately so we
// can diagnose why the installed app exits before desktop.log is created.

let _bootstrapLogPath = null;

function _bootstrapLog(level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;
  try {
    const userData = app.getPath("userData");
    if (!_bootstrapLogPath) {
      const dir = path.join(userData, "logs");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      _bootstrapLogPath = path.join(dir, "bootstrap.log");
    }
    fs.appendFileSync(_bootstrapLogPath, line, "utf8");
  } catch {
    // Last resort — write to console so it's not silently swallowed.
  }
  if (level === "ERROR") {
    console.error(`[BusinessOS:BOOT] ${message}`);
  } else {
    console.log(`[BusinessOS:BOOT] ${message}`);
  }
}

// --- Emit very first line ---
_bootstrapLog("INFO", "=== BOOTSTRAP START ===");
try {
  _bootstrapLog("INFO", `app.getName()=${typeof app.getName === "function" ? app.getName() : "N/A"}`);
  _bootstrapLog("INFO", `app.isPackaged=${app.isPackaged}`);
  _bootstrapLog("INFO", `app.getPath("userData")=${app.getPath("userData")}`);
  _bootstrapLog("INFO", `process.resourcesPath=${process.resourcesPath}`);
  _bootstrapLog("INFO", `process.execPath=${process.execPath}`);
  _bootstrapLog("INFO", `process.platform=${process.platform}`);
  _bootstrapLog("INFO", `process.version=${process.version}`);
  _bootstrapLog("INFO", `process.arch=${process.arch}`);
} catch (e) {
  console.log(`[BusinessOS:BOOT] Bootstrap metadata error: ${e.message}`);
}

// ---------------------------------------------------------------------------
// Global error handlers — registered immediately
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

const LOOPBACK_HOST = "127.0.0.1";
const SERVER_READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_INITIAL_MS = 250;
const POLL_INTERVAL_MAX_MS = 500;
const HEALTH_PATH = "/api/health";
const SPLASH_WIDTH = 420;
const SPLASH_HEIGHT = 320;
const MAIN_MIN_WIDTH = 1024;
const MAIN_MIN_HEIGHT = 700;
const MAIN_DEFAULT_WIDTH = 1440;
const MAIN_DEFAULT_HEIGHT = 960;
const SHUTDOWN_TIMEOUT_MS = 5_000;

const RUNTIME_ENV_KEYS = new Set([
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
]);

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let serverOrigin = null;
let quitting = false;
let shutdownStarted = false;

// ---------------------------------------------------------------------------
// Logging (for non-bootstrap log messages)
// ---------------------------------------------------------------------------

function ensureLogDir() {
  const dir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function appendLog(level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;
  try {
    fs.appendFileSync(path.join(ensureLogDir(), "desktop.log"), line, "utf8");
  } catch {
    // Best effort.
  }
  if (level === "ERROR") {
    console.error(`[BusinessOS] ${message}`);
  } else {
    console.log(`[BusinessOS] ${message}`);
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
        `  CLERK_SECRET_KEY=sk_...\n\n` +
        `You can copy these from your .env.local file.`
    );
  }
  const values = parseRuntimeEnv(fs.readFileSync(configPath, "utf8"));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  const missing = ["DATABASE_URL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"].filter(
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
    probe.listen({ host: LOOPBACK_HOST, port: 0, exclusive: true }, () => {
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

// ---------------------------------------------------------------------------
// Next.js server process
// ---------------------------------------------------------------------------

function buildPackagedEnv(port) {
  return {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: LOOPBACK_HOST,
    PORT: String(port),
    ELECTRON_RUN_AS_NODE: "1",
  };
}

function buildDevEnv(port) {
  return {
    ...process.env,
    NODE_ENV: "development",
    HOSTNAME: LOOPBACK_HOST,
    PORT: String(port),
  };
}

/**
 * Spawn the packaged Next.js standalone server.
 *
 * Uses execFile first (auto-quotes args on Windows, avoids EINVAL when paths
 * contain spaces). Falls back to spawn + shell:true if execFile fails.
 */
function spawnPackagedServer(port) {
  const serverRoot = path.join(process.resourcesPath, "next");
  const serverEntry = path.join(serverRoot, "server.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Packaged Next.js server is missing at: ${serverEntry}`);
  }

  const env = buildPackagedEnv(port);
  appendLog("INFO", `Packaged server entry: ${serverEntry}`);
  appendLog("INFO", `Packaged server cwd:   ${serverRoot}`);
  appendLog("INFO", `process.execPath:      ${process.execPath}`);
  appendLog("INFO", `resourcesPath:        ${process.resourcesPath}`);

  // Strategy 1: execFile — handles argument quoting automatically on Windows.
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

  // Strategy 2: spawn with shell:true — lets cmd.exe handle quoting.
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

  return spawn(npmCommand, ["run", "dev", "--", "--hostname", LOOPBACK_HOST, "--port", String(port)], {
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
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    appendLog("INFO", `Server start attempt ${attempt + 1}/3`);
    const port = await reserveAvailablePort();
    const origin = `http://${LOOPBACK_HOST}:${port}`;
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
      // Wait for the killed process to exit before retrying
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
    closable: false,
    show: false,
    center: true,
    title: "BusinessOS",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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
  splashWindow.once("ready-to-show", () => splashWindow?.show());
}

function closeSplashWindow() {
  if (!splashWindow) return;
  appendLog("INFO", "STAGE: closing splash window...");
  try { splashWindow.close(); } catch { /* ignore */ }
  splashWindow = null;
  appendLog("INFO", "STAGE: splash closed");
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin === serverOrigin) return;
    } catch { /* invalid URL — block */ }
    event.preventDefault();
    if (url.startsWith("https://")) void shell.openExternal(url);
  });

  mainWindow.once("ready-to-show", () => {
    appendLog("INFO", "STAGE: main window ready-to-show — closing splash");
    closeSplashWindow();
    mainWindow?.show();
    appendLog("INFO", "STAGE: main window shown");
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  appendLog("INFO", `STAGE: main window loading ${serverOrigin}`);
  void mainWindow.loadURL(serverOrigin);
}

// ---------------------------------------------------------------------------
// Application entry — stage-logged
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
  });

  _bootstrapLog("INFO", "STAGE: waiting for app.whenReady()...");
  app.whenReady().then(async () => {
    appendLog("INFO", "STAGE: app.whenReady() resolved");
    try {
      appendLog("INFO", `BusinessOS starting (packaged=${app.isPackaged})`);
      appendLog("INFO", `process.execPath=${process.execPath}`);
      appendLog("INFO", `process.resourcesPath=${process.resourcesPath ?? "N/A"}`);
      appendLog("INFO", `app.getAppPath()=${app.getAppPath()}`);
      appendLog("INFO", `app.getPath("userData")=${app.getPath("userData")}`);

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

      appendLog("INFO", "STAGE: setting permission handler...");
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

      appendLog("INFO", "STAGE: creating splash window...");
      createSplashWindow();
      appendLog("INFO", "STAGE: splash window created");

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

      appendLog("INFO", "STAGE: creating main window...");
      createMainWindow();
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
