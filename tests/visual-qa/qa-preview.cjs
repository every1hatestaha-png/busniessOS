"use strict";

const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const outputDir = path.join(root, "tests/visual-qa/qa-preview-output");
fs.mkdirSync(outputDir, { recursive: true });

const port = 3331;
const baseUrl = `http://127.0.0.1:${port}`;
const views = ["dashboard", "sales", "purchases", "inventory", "customers", "suppliers", "manufacturing", "finance", "reports", "print", "settings"];
let serverProcess = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopServer() {
  if (!serverProcess?.pid) return;
  try { serverProcess.kill("SIGTERM"); } catch {}
  serverProcess = null;
}

async function startServer() {
  serverProcess = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      QA_VISUAL_PREVIEW: "1",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk",
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || "sk_test_fixture",
    },
    stdio: "inherit",
  });

  for (let i = 0; i < 120; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/qa-preview?view=dashboard`, { redirect: "manual" });
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("QA preview server did not become ready.");
}

async function inspectPage(win) {
  return win.webContents.executeJavaScript(`(() => {
    const imgs = Array.from(document.images).map((img) => ({
      alt: img.alt,
      src: img.currentSrc || img.src,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      rect: (() => { const r = img.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })(),
    }));
    const bodyText = document.body.innerText || "";
    const suspicious = ["Application error", "Internal Server Error", "Unhandled Runtime Error", "404", "not found"].filter((needle) => bodyText.toLowerCase().includes(needle.toLowerCase()));
    return {
      url: location.href,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      documentHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      brokenImages: imgs.filter((img) => !img.complete || img.naturalWidth === 0),
      arshadImages: imgs.filter((img) => (img.alt || "").includes("Arshad Sons")),
      suspicious,
    };
  })()`);
}

async function capture(view, width, height, suffix) {
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    webPreferences: { contextIsolation: true, sandbox: false, nodeIntegration: false },
  });

  const consoleMessages = [];
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) consoleMessages.push(`[${level}] ${message}`);
  });

  try {
    await win.loadURL(`${baseUrl}/qa-preview?view=${view}`);
    await sleep(900);
    const initial = await inspectPage(win);
    const targetHeight = Math.max(height, Math.min(initial.documentHeight + 40, suffix === "mobile" ? 3200 : 4200));
    win.setContentSize(width, targetHeight);
    await sleep(250);
    const final = await inspectPage(win);
    const image = await win.webContents.capturePage();
    const file = path.join(outputDir, `${view}-${suffix}.png`);
    fs.writeFileSync(file, image.toPNG());
    return { view, suffix, file, ...final, consoleMessages };
  } catch (error) {
    return { view, suffix, error: error instanceof Error ? error.message : String(error), consoleMessages };
  } finally {
    win.destroy();
  }
}

async function run() {
  await startServer();
  const results = [];
  for (const view of views) {
    results.push(await capture(view, 1440, 1100, "desktop"));
    results.push(await capture(view, 390, 844, "mobile"));
    console.log(`Captured ${view}`);
  }
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(results, null, 2));

  const failures = results.filter((result) => result.error || result.horizontalOverflow || result.brokenImages?.length || result.suspicious?.length);
  console.log(`QA preview captures: ${results.length}; flagged: ${failures.length}`);
  if (failures.length) console.log(JSON.stringify(failures, null, 2));

  stopServer();
  for (const win of BrowserWindow.getAllWindows()) win.destroy();
  app.quit();
}

app.whenReady().then(run).catch((error) => {
  console.error(error);
  stopServer();
  app.exit(1);
});

setTimeout(() => {
  console.error("QA preview visual run timed out.");
  stopServer();
  app.exit(1);
}, 900000);
