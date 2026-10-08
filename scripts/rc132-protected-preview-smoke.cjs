/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

/**
 * Read-only hosted acceptance for the EXACT RC132 isolated Preview.
 * Requires a short-lived access credential supplied privately by an operator;
 * never changes Deployment Protection or prints the credential.
 */
const APPROVED_HOST = "munshios-restaurant-staging-koqofe1bz-khzr.vercel.app";
const APPROVED_SHA = "e777e3ee88ac410b16a247c3411d814ddd8c8bed";

function validateSmokeEnvironment(env) {
  const secret = String(env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
  if (!secret || /[\r\n]/.test(secret)) {
    throw new Error("Protected preview smoke requires a valid privately supplied access token.");
  }

  const raw = String(env.RC132_STAGING_URL ?? `https://${APPROVED_HOST}`);
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("Unapproved RC132 staging URL."); }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== APPROVED_HOST ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) throw new Error("Unapproved RC132 staging URL.");

  const revision = String(env.RC132_EXPECTED_SHA ?? "");
  if (revision !== APPROVED_SHA) throw new Error("Staging revision must match the exact certified Preview commit.");
  return { base: parsed.origin, secret, revision: APPROVED_SHA.slice(0, 12) };
}

async function checkJson(fetchImpl, path, config) {
  const response = await fetchImpl(config.base + path, {
    method: "GET",
    redirect: "manual",
    cache: "no-store",
    headers: { "accept": "application/json", "x-vercel-protection-bypass": config.secret },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 200) throw new Error(`${path} rejected: HTTP ${response.status}.`);
  const type = response.headers?.get?.("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new Error(`${path} returned non-JSON content; preview protection may still be blocking.`);
  }
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`${path} returned invalid JSON.`); }
  if (!body || typeof body !== "object" || body.ok !== true) {
    throw new Error(`${path} did not report healthy status.`);
  }
  return body;
}

async function runProtectedPreviewSmoke(env = process.env, fetchImpl = globalThis.fetch) {
  const config = validateSmokeEnvironment(env);
  const health = await checkJson(fetchImpl, "/api/health", config);
  const readiness = await checkJson(fetchImpl, "/api/readiness", config);
  if (
    health.ok !== true ||
    readiness.database !== "ready" ||
    readiness.auth !== "configured" ||
    readiness.revision !== config.revision
  ) throw new Error("Hosted readiness did not match the certified revision, database and auth configuration.");
  return {
    health: "PASS",
    readiness: "PASS",
    revision: config.revision,
  };
}

if (require.main === module) {
  runProtectedPreviewSmoke().then(
    (result) => console.log(JSON.stringify(result)),
    (error) => {
      // Never serialize env, response bodies, request headers, cookies or URLs
      // containing secrets into CI logs or support tickets.
      console.error(error instanceof Error ? error.message : "Protected preview smoke failed.");
      process.exitCode = 1;
    },
  );
}

module.exports = { APPROVED_HOST, APPROVED_SHA, validateSmokeEnvironment, runProtectedPreviewSmoke };
