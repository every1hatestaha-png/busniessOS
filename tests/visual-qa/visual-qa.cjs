"use strict";

require("dotenv").config({ path: require("node:path").resolve(__dirname, "../../.env.local") });

const electron = require("electron");
const { app, BrowserWindow, safeStorage, session } = electron;
const { spawn, spawnSync } = require("node:child_process");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "../..");
const profile = path.join(root, ".desktop-dev");
fs.mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);

const OUTPUT_DIR = path.join(root, "tests/visual-qa/output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const QA_PORT = "3320";
const DEV_SERVER = `http://localhost:${QA_PORT}`;
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "visual-qa-document-ids.json"), "utf8"));
const today = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 370 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
let serverProcess = null;

function stopDevServer() {
  if (!serverProcess?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(serverProcess.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    serverProcess.kill("SIGTERM");
  }
  serverProcess = null;
}

async function startDevServer() {
  serverProcess = spawn("npm", ["run", "dev"], {
    cwd: root,
    env: { ...process.env, PORT: QA_PORT },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${DEV_SERVER}/api/health`);
      if (response.ok) return;
    } catch { /* Server is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Next development server did not become ready.");
}

async function ensureQaMembership(clerkId) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const parsed = new URL(process.env.DATABASE_URL);
  const sslMode = parsed.searchParams.get("sslmode");
  if (!sslMode || ["prefer", "require", "verify-ca"].includes(sslMode)) parsed.searchParams.set("sslmode", "verify-full");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: parsed.toString() }) });
  try {
    const user = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
    if (!user) throw new Error("Authenticated Clerk user is not provisioned in BusinessOS.");
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: "visual-qa-workspace", userId: user.id } },
      create: { workspaceId: "visual-qa-workspace", userId: user.id, role: "OWNER" },
      update: { role: "OWNER" },
    });
  } finally {
    await prisma.$disconnect();
  }
}

const TEST_SCENARIOS = [
  ...Object.entries(ids.invoices).filter(([name]) => !name.startsWith("aging-")).map(([name, id]) => ({ name: `invoice-${name}`, url: `/invoices/${id}`, waitFor: "[data-document]" })),
  ...Object.entries(ids.purchaseOrders).map(([name, id]) => ({ name: `po-${name}`, url: `/purchases/${id}/print?autoprint=0`, waitFor: "[data-document]" })),
  ...Object.entries(ids.grns).map(([name, id]) => ({ name: `grn-${name}`, url: `/goods-receipts/${id}/print?autoprint=0`, waitFor: "[data-document]" })),
  { name: "supplier-return", url: `/supplier-returns/${ids.supplierReturn}`, waitFor: "h1" },
  { name: "payment-receipt", url: `/payments/${ids.paymentReceipt}`, waitFor: "[data-document]" },
  { name: "expense-voucher", url: `/accounting/expenses/${ids.expenseVoucher}`, waitFor: "[data-document]" },
  { name: "customer-statement", url: `/reports/customer-statement?partyId=${ids.reports.customerId}&from=${from}&to=${today}`, waitFor: "article" },
  { name: "supplier-statement", url: `/reports/supplier-statement?partyId=${ids.reports.supplierId}&from=${from}&to=${today}`, waitFor: "article" },
  { name: "receivables-aging", url: `/receivables?customerId=${ids.reports.customerId}&asOf=${today}`, waitFor: "h1" },
  { name: "payables-aging", url: `/payables?supplierId=${ids.reports.supplierId}&asOf=${today}`, waitFor: "h1" },
  { name: "profit-loss", url: `/reports/profit-loss?from=${from}&to=${today}`, waitFor: "article" },
  { name: "general-ledger", url: `/reports/general-ledger?accountId=${ids.reports.generalLedgerAccountId}&from=${from}&to=${today}`, waitFor: "article" },
  { name: "cash-bank-ledger", url: `/reports/cash-bank?accountId=${ids.reports.cashBankAccountId}&from=${from}&to=${today}`, waitFor: "article" },
];

async function capturePage(url, name) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: {
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
      },
    });

    const logs = [];
    win.webContents.on("console-message", (e, level, message) => {
      logs.push(`[${level}] ${message}`);
    });
    win.webContents.on("dom-ready", () => {
      void win.webContents.executeJavaScript("window.print = () => undefined; true").catch(() => {});
    });

    win.loadURL(`${DEV_SERVER}${url}`).then(async () => {
      try {
        // Wait for content to load
        await new Promise(r => setTimeout(r, 2000));

        const found = await win.webContents.executeJavaScript(`
          new Promise((resolve) => {
            const check = () => {
              const el = document.querySelector(${JSON.stringify(TEST_SCENARIOS.find(scenario => scenario.name === name)?.waitFor || "main")});
              if (el) return resolve(true);
              return false;
            };
            if (!check()) {
              const observer = new MutationObserver(() => { if (check()) { observer.disconnect(); resolve(true); } });
              observer.observe(document.body, { childList: true, subtree: true });
               setTimeout(() => { observer.disconnect(); resolve(false); }, 30000);
            }
          })
        `);
        if (!found) throw new Error(`Expected content did not render at ${win.webContents.getURL()}`);
        if (new URL(win.webContents.getURL()).pathname.startsWith("/desktop-auth")) throw new Error("Authentication redirected to desktop-auth");

        // Capture screenshot
        const screenshotPath = path.join(OUTPUT_DIR, `${name}.png`);
        await win.webContents.capturePage().then(img => {
          fs.writeFileSync(screenshotPath, img.toPNG());
        });

        win.webContents.debugger.attach("1.3");
        await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { media: "print" });
        await new Promise(r => setTimeout(r, 250));
        const printScreenshotPath = path.join(OUTPUT_DIR, `${name}-print.png`);
        await win.webContents.capturePage().then(img => {
          fs.writeFileSync(printScreenshotPath, img.toPNG());
        });
        win.webContents.debugger.detach();

        // Capture PDF using printToPDF
        const pdfPath = path.join(OUTPUT_DIR, `${name}.pdf`);
        const pdfData = await win.webContents.printToPDF({
          landscape: false,
          marginsType: 1, // default
          printBackground: true,
          printSelectionOnly: false,
          pageSize: "A4",
          preferCSSPageSize: true,
        });
        fs.writeFileSync(pdfPath, pdfData);

        // Capture HTML for inspection
        const html = await win.webContents.executeJavaScript("document.documentElement.outerHTML");
        const htmlPath = path.join(OUTPUT_DIR, `${name}.html`);
        fs.writeFileSync(htmlPath, html);

        console.log(`✓ Captured: ${name}`);
        resolve({ name, screenshot: screenshotPath, printScreenshot: printScreenshotPath, pdf: pdfPath, html: htmlPath, logs });
      } catch (e) {
        console.error(`✗ Failed: ${name}`, e.message);
        resolve({ name, error: e.message, logs });
      }
    }).catch(e => {
      console.error(`✗ Load failed: ${name}`, e.message);
      win.destroy();
      reject(e);
    });
  });
}

async function run() {
  console.log("Starting Visual QA...");
  console.log("Dev server:", DEV_SERVER);
  console.log("Output dir:", OUTPUT_DIR);

  const credentialPath = path.join(profile, "desktop-credentials.bin");
  if (!fs.existsSync(credentialPath)) {
    throw new Error("No encrypted desktop development credentials found. Run npm run desktop:dev and sign in once before visual QA.");
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Electron safeStorage is unavailable.");
  const credentials = JSON.parse(safeStorage.decryptString(fs.readFileSync(credentialPath)));
  if (!credentials.accessToken || credentials.expiration <= Date.now()) {
    throw new Error("Desktop development credentials are missing or expired. Sign in again with npm run desktop:dev.");
  }
  if (!credentials.userId) throw new Error("Desktop credentials do not identify the authenticated user.");
  await ensureQaMembership(credentials.userId);
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${DEV_SERVER}/*`] }, (details, callback) => {
    details.requestHeaders.Authorization = `Bearer ${credentials.accessToken}`;
    callback({ requestHeaders: details.requestHeaders });
  });
  await session.defaultSession.cookies.set({ url: DEV_SERVER, name: "businessos_workspace", value: "visual-qa-workspace", httpOnly: true, sameSite: "lax", path: "/" });
  await startDevServer();

  const startAt = process.env.VISUAL_QA_START_AT;
  const startIndex = startAt ? TEST_SCENARIOS.findIndex(scenario => scenario.name === startAt) : 0;
  if (startAt && startIndex < 0) throw new Error(`Unknown VISUAL_QA_START_AT scenario: ${startAt}`);
  const results = [];
  for (const scenario of TEST_SCENARIOS.slice(Math.max(0, startIndex))) {
    results.push(await capturePage(scenario.url, scenario.name));
    await new Promise(r => setTimeout(r, 500));
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, "results.json"), JSON.stringify(results, null, 2));

  console.log("\nVisual QA complete. Output in:", OUTPUT_DIR);
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  stopDevServer();
  app.quit();
}

app.whenReady().then(run).catch(e => { console.error(e); stopDevServer(); app.exit(1); });

// Timeout
setTimeout(() => { console.error("Visual QA timed out"); stopDevServer(); app.exit(1); }, 1_800_000);
