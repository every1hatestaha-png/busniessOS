const { createHash } = require("node:crypto");

const TARGETS = {
  production: new Set([
    "ep-plain-smoke-b35qxc96.c-4.ap-southeast-1.aws.neon.tech",
    "ep-plain-smoke-b35qxc96-pooler.c-4.ap-southeast-1.aws.neon.tech",
    "ep-plain-smoke-b35qxc96-pql.c-4.ap-southeast-1.aws.neon.tech",
    "ep-plain-smoke-b35qxc96-pql-pooler.c-4.ap-southeast-1.aws.neon.tech",
  ]),
  development: new Set([
    "ep-icy-recipe-b3fwtekt.c-4.ap-southeast-1.aws.neon.tech",
    "ep-icy-recipe-b3fwtekt-pooler.c-4.ap-southeast-1.aws.neon.tech",
    "ep-icy-recipe-b3fwtekt-q05.c-4.ap-southeast-1.aws.neon.tech",
    "ep-icy-recipe-b3fwtekt-q05-pooler.c-4.ap-southeast-1.aws.neon.tech",
  ]),
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
if (decodeURIComponent(parsed.pathname.replace(/^\//, "")) !== "neondb") {
  fail("Refusing production migration: DATABASE_URL does not target the approved production database.");
}

console.log("Production database target assertion passed.");
