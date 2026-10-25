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
