const APPROVED_HOSTS = new Set([
  "ep-plain-smoke-b35qxc96.c-4.ap-southeast-1.aws.neon.tech",
  "ep-plain-smoke-b35qxc96-pooler.c-4.ap-southeast-1.aws.neon.tech",
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const value = process.env.DATABASE_URL;
if (!value) fail("Refusing production migration: DATABASE_URL is not configured.");

let parsed;
try {
  parsed = new URL(value);
} catch {
  fail("Refusing production migration: DATABASE_URL is invalid.");
}

if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
  fail("Refusing production migration: DATABASE_URL is not PostgreSQL.");
}
if (!APPROVED_HOSTS.has(parsed.hostname.toLowerCase())) {
  fail("Refusing production migration: DATABASE_URL does not target the approved MunshiOS production Neon endpoint.");
}
if (decodeURIComponent(parsed.pathname.replace(/^\//, "")) !== "neondb") {
  fail("Refusing production migration: DATABASE_URL does not target the approved production database.");
}

console.log("Production database target assertion passed.");
