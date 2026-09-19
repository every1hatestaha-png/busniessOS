"use strict";

const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { spawn, spawnSync } = require("node:child_process");

const RELEASES_API = "https://api.github.com/repos/every1hatestaha-png/busniessOS/releases/latest";
const USER_AGENT = "MunshiOS-Desktop-Updater";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 30 * 1000;

function parseStableVersion(value) {
  const match = String(value || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(candidate, current) {
  const next = parseStableVersion(candidate);
  const installed = parseStableVersion(current);
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] > installed[index]) return true;
    if (next[index] < installed[index]) return false;
  }
  return false;
}

function selectReleaseAssets(release) {
  if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) return null;
  const installer = release.assets.find((asset) => /MunshiOS.*Setup.*\.exe$/i.test(asset.name || ""))
    || release.assets.find((asset) => /\.exe$/i.test(asset.name || ""));
  if (!installer) return null;
  const checksumName = `${installer.name}.sha256`;
  const checksum = release.assets.find((asset) => asset.name === checksumName);
  if (!checksum) return null;
  return { installer, checksum };
}

function parseSha256(text, expectedFileName) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (match && path.basename(match[2]) === path.basename(expectedFileName)) return match[1].toLowerCase();
  }
  const bare = lines.find((line) => /^[a-f0-9]{64}$/i.test(line));
  return bare ? bare.toLowerCase() : null;
}

async function fetchJson(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Update metadata request failed with HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  if (!response.ok) throw new Error(`Checksum request failed with HTTP ${response.status}`);
  return response.text();
}

async function downloadFile(url, destination, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Update download failed with HTTP ${response.status}`);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function verifyAuthenticode(filePath) {
  if (process.platform !== "win32") return { valid: false, status: "UNSUPPORTED_PLATFORM" };
  const escaped = filePath.replace(/'/g, "''");
  const command = `$s=Get-AuthenticodeSignature -LiteralPath '${escaped}'; Write-Output ($s.Status.ToString() + '|' + ($s.SignerCertificate.Subject -as [string]))`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
  });
  const output = String(result.stdout || "").trim();
  const [status, subject = ""] = output.split("|");
  return { valid: result.status === 0 && status === "Valid", status: status || "UNKNOWN", subject };
}

function scheduleSignedInstaller(app, installerPath, log) {
  if (process.platform !== "win32") throw new Error("Desktop updates are only supported on Windows");
  const escaped = installerPath.replace(/'/g, "''");
  const script = [
    `$pidToWait=${process.pid}`,
    "while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }",
    `Start-Process -FilePath '${escaped}' -ArgumentList '/S'`,
  ].join("; ");
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  log("INFO", "[UPDATER] signed installer scheduled after app exit");
  app.quit();
}

async function checkForDesktopUpdate({ app, dialog, shell, log, fetchImpl = globalThis.fetch }) {
  if (!app.isPackaged || process.platform !== "win32") return { status: "SKIPPED" };

  const release = await fetchJson(RELEASES_API, fetchImpl);
  const releaseVersion = String(release.tag_name || "").replace(/^v/, "");
  if (!isNewerVersion(releaseVersion, app.getVersion())) return { status: "CURRENT" };

  const assets = selectReleaseAssets(release);
  if (!assets) throw new Error("Latest release does not contain a MunshiOS installer and matching SHA-256 file");

  const choice = await dialog.showMessageBox({
    type: "info",
    title: "MunshiOS update available",
    message: `MunshiOS ${releaseVersion} is available.`,
    detail: "Download the verified update now? Your business data is not stored inside the installer.",
    buttons: ["Download update", "Later"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (choice.response !== 0) return { status: "DEFERRED", version: releaseVersion };

  const updateDir = path.join(app.getPath("temp"), "MunshiOS-updates", releaseVersion);
  const installerPath = path.join(updateDir, path.basename(assets.installer.name));
  const checksumText = await fetchText(assets.checksum.browser_download_url, fetchImpl);
  const expectedSha = parseSha256(checksumText, assets.installer.name);
  if (!expectedSha) throw new Error("Release checksum file is invalid");

  await downloadFile(assets.installer.browser_download_url, installerPath, fetchImpl);
  const actualSha = await sha256File(installerPath);
  if (actualSha !== expectedSha) {
    await fs.promises.rm(installerPath, { force: true });
    throw new Error("Downloaded installer checksum does not match the release manifest");
  }
  log("INFO", `[UPDATER] checksum verified version=${releaseVersion}`);

  const signature = verifyAuthenticode(installerPath);
  if (!signature.valid) {
    log("WARN", `[UPDATER] automatic install blocked Authenticode status=${signature.status}`);
    const unsignedChoice = await dialog.showMessageBox({
      type: "warning",
      title: "Update verified but not code-signed",
      message: "Automatic installation is blocked for safety.",
      detail: "The installer checksum matches the official MunshiOS release, but Windows does not report a valid Authenticode signature. Open the official release page instead?",
      buttons: ["Open official release", "Close"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (unsignedChoice.response === 0 && release.html_url) await shell.openExternal(release.html_url);
    return { status: "UNSIGNED", version: releaseVersion };
  }

  log("INFO", `[UPDATER] Authenticode valid signer=${signature.subject || "unknown"}`);
  const installChoice = await dialog.showMessageBox({
    type: "info",
    title: "Update ready",
    message: `MunshiOS ${releaseVersion} is verified and ready to install.`,
    detail: "MunshiOS will close, install the signed update, and can then be opened again.",
    buttons: ["Install and close MunshiOS", "Later"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (installChoice.response !== 0) return { status: "DOWNLOADED", version: releaseVersion, installerPath };

  scheduleSignedInstaller(app, installerPath, log);
  return { status: "INSTALLING", version: releaseVersion };
}

function scheduleDesktopUpdateChecks({ app, dialog, shell, log, fetchImpl = globalThis.fetch }) {
  if (!app.isPackaged || process.platform !== "win32") return () => {};
  let stopped = false;
  let interval = null;

  const run = async () => {
    if (stopped) return;
    try {
      const result = await checkForDesktopUpdate({ app, dialog, shell, log, fetchImpl });
      log("INFO", `[UPDATER] check result=${result.status}${result.version ? ` version=${result.version}` : ""}`);
    } catch (error) {
      log("WARN", `[UPDATER] check failed error=${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const initial = setTimeout(() => {
    void run();
    interval = setInterval(() => { void run(); }, CHECK_INTERVAL_MS);
    interval.unref?.();
  }, INITIAL_CHECK_DELAY_MS);
  initial.unref?.();

  return () => {
    stopped = true;
    clearTimeout(initial);
    if (interval) clearInterval(interval);
  };
}

module.exports = {
  checkForDesktopUpdate,
  isNewerVersion,
  parseSha256,
  parseStableVersion,
  scheduleDesktopUpdateChecks,
  selectReleaseAssets,
  sha256File,
  verifyAuthenticode,
};
