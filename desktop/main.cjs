"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { app, BrowserWindow, dialog, session, shell } = require("electron");

const LOOPBACK_HOST = "127.0.0.1";
const SERVER_READY_TIMEOUT_MS = 90_000;
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
let serverProcess = null;
let serverOrigin = null;
let quitting = false;
let shutdownStarted = false;

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
    throw new Error(`Desktop configuration is missing. Install runtime.env at:\n${configPath}`);
  }

  const values = parseRuntimeEnv(fs.readFileSync(configPath, "utf8"));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;

  const missing = ["DATABASE_URL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"].filter(
    (key) => !process.env[key]
  );
  if (missing.length) throw new Error(`Desktop configuration is missing required variables: ${missing.join(", ")}`);
}

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

function spawnNextServer(port) {
  const environment = {
    ...process.env,
    NODE_ENV: app.isPackaged ? "production" : "development",
    HOSTNAME: LOOPBACK_HOST,
    PORT: String(port),
  };

  if (app.isPackaged) {
    const serverRoot = path.join(process.resourcesPath, "next");
    const serverEntry = path.join(serverRoot, "server.js");
    if (!fs.existsSync(serverEntry)) throw new Error("Packaged Next.js server is missing.");

    return spawn(process.execPath, [serverEntry], {
      cwd: serverRoot,
      env: { ...environment, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawn(npmCommand, ["run", "dev", "--", "--hostname", LOOPBACK_HOST, "--port", String(port)], {
    cwd: path.resolve(__dirname, ".."),
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function waitForServer(child, origin) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve();
    };

    const onExit = (code) => finish(new Error(`Local BusinessOS server exited before startup (code ${code ?? "unknown"}).`));
    child.once("exit", onExit);

    const poll = () => {
      if (settled) return;
      if (Date.now() >= deadline) {
        finish(new Error("Local BusinessOS server did not become ready in time."));
        return;
      }

      const request = http.get(`${origin}/sign-in`, (response) => {
        response.resume();
        if ((response.statusCode ?? 500) < 500) finish();
        else setTimeout(poll, 250);
      });
      request.setTimeout(1_000, () => request.destroy());
      request.on("error", () => setTimeout(poll, 250));
    };

    poll();
  });
}

async function startLocalServer() {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const port = await reserveAvailablePort();
    const origin = `http://${LOOPBACK_HOST}:${port}`;
    const child = spawnNextServer(port);

    child.stdout?.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
    child.stderr?.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));

    try {
      await waitForServer(child, origin);
      serverProcess = child;
      serverOrigin = origin;
      child.once("exit", (code) => {
        if (!quitting) {
          dialog.showErrorBox("BusinessOS server stopped", `The local server exited unexpectedly (code ${code ?? "unknown"}).`);
          app.quit();
        }
      });
      return;
    } catch (error) {
      lastError = error;
      child.kill();
    }
  }

  throw lastError ?? new Error("Could not start the local BusinessOS server.");
}

function stopLocalServer() {
  if (!serverProcess?.pid) return Promise.resolve();

  const child = serverProcess;
  serverProcess = null;

  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(resolve, 5_000);
    killer.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    killer.once("error", () => {
      clearTimeout(timer);
      child.kill();
      resolve();
    });
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
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
    if (new URL(url).origin === serverOrigin) return;
    event.preventDefault();
    if (url.startsWith("https://")) void shell.openExternal(url);
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(serverOrigin);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      if (app.isPackaged) loadPackagedRuntimeEnv();
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
      await startLocalServer();
      createMainWindow();
    } catch (error) {
      dialog.showErrorBox("BusinessOS could not start", error instanceof Error ? error.message : "Unknown startup error.");
      app.quit();
    }
  });

  app.on("window-all-closed", () => app.quit());

  app.on("before-quit", (event) => {
    quitting = true;
    if (!serverProcess || shutdownStarted) return;

    event.preventDefault();
    shutdownStarted = true;
    void stopLocalServer().finally(() => app.quit());
  });
}
