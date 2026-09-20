/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require("node:crypto");
const targetConfig = require("../config/database-targets.json");

const TARGETS = {
  production: new Set(targetConfig.productionHosts),
  development: new Set(targetConfig.developmentHosts),
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

const value = process.env.DATABASE_URL;
if (!value) fail("Refusing production migration: DATABASE_URL is not configured.");

let parsed;
try { parsed = new URL(value); } catch {
  fail("Refusing production migration: DATABASE_URL is invalid.");
}

if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
  fail("Refusing production migration: DATABASE_URL is not PostgreSQL.");
}

const hostname = parsed.hostname.toLowerCase();
const classification = TARGETS.production.has(hostname)
  ? "production"
  : TARGETS.development.has(hostname)
    ? "development"
    : "unknown";
const fingerprint = createHash("sha256").update(hostname).digest("hex").slice(0, 12);

if (classification !== "production") {
  fail(`Refusing production migration: database target classification=${classification}; hostFingerprint=${fingerprint}.`);
}
if (decodeURIComponent(parsed.pathname.replace(/^\//, "")) !== targetConfig.database) {
  fail("Refusing production migration: DATABASE_URL does not target the approved production database.");
}

console.log("Production database target assertion passed.");
