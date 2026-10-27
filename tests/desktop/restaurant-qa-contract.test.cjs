"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/restaurant-windows-qa.yml"), "utf8");
const main = fs.readFileSync(path.join(root, "desktop/main.cjs"), "utf8");

test("QA build has separate installer identity and never publishes", () => {
  const required = [
    'munshios-restaurant-qa',
    'tech.munshios.restaurant.qa',
    'MunshiOS Restaurant QA',
    'CSC_IDENTITY_AUTO_DISCOVERY',
    'electron-builder --win nsis --publish never'
  ];
  for (const item of required) assert.ok(workflow.includes(item), item);
});

test("QA artifact includes hash and manual acceptance instructions", () => {
  for (const item of ['Get-FileHash -Algorithm SHA256','SHA256SUMS.txt','QA-ACCEPTANCE.md','retention-days: 7'])
    assert.ok(workflow.includes(item), item);
});

test("QA desktop refuses default and known production hosts", () => {
  for (const item of [
    'app.getName() === "MunshiOS Restaurant QA"',
    'Restaurant QA needs an explicit BUSINESSOS_APP_ORIGIN staging URL',
    'validateHostedOrigin(candidate)',
    'host === "munshios.tech"',
    'host === "www.munshios.tech"',
    'host === "business-os-khzr.vercel.app"'
  ]) assert.ok(main.includes(item), item);
});

const proxy = fs.readFileSync(path.join(root, "proxy.ts"), "utf8");
const readiness = fs.readFileSync(path.join(root, "app/api/readiness/route.ts"), "utf8");
const auth = fs.readFileSync(path.join(root, "lib/server/auth.ts"), "utf8");
const nav = fs.readFileSync(path.join(root, "components/layout/top-nav.tsx"), "utf8");

test("Restaurant QA Electron uses Supabase session only on a ready staging backend", () => {
  assert.ok(main.includes('state.environment !== "staging"'));
  assert.ok(main.includes('state.database !== "ready"'));
  assert.ok(main.includes('const storedCredentialsReady = isRestaurantQaApp() ? false : await prepareStoredCredentials()'));
  assert.ok(main.includes('const initialUrl = isRestaurantQaApp() ?'));
  assert.ok(main.includes('requires a dedicated MunshiOS staging preview URL'));
  assert.ok(proxy.includes('const stagingSupabaseDesktop = isElectron && process.env.MUNSHIOS_DEPLOYMENT_ENVIRONMENT === "staging"'));
  assert.ok(auth.includes('process.env.MUNSHIOS_DEPLOYMENT_ENVIRONMENT !== "staging" ? "/desktop-auth" : "/sign-in"'));
  assert.ok(nav.includes('useLegacyDesktopMenu ? <DesktopClerkAccountMenu /> : <WebAccountMenu />'));
  assert.ok(readiness.includes('environment: process.env.MUNSHIOS_DEPLOYMENT_ENVIRONMENT === "staging"'));
});
