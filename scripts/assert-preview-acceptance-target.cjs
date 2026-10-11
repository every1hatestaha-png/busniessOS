/* eslint-disable @typescript-eslint/no-require-imports */
const policy = require("../config/preview-acceptance-targets.json");
const { hasSafeNeonUrlOptions } = require("./safe-neon-url-options.cjs");

/**
 * This is a fail-closed Preview *deployment* guard, not a migration tool.
 * An exact-host allowlist points only to the independently verified sterile
 * nonproduction Neon project. It does not imply database-schema or release approval.
 * No provider I/O and never logs or returns connection credentials.
 */
function assertPreviewAcceptanceTarget(env, approvedHosts = policy.approvedHostnames) {
  // A manually triggered Preview may lack VERCEL_GIT_COMMIT_REF altogether.
  // Always guard the staging project, and refuse deploying release candidates
  // on any other Vercel project. Never rely on a caller-provided ref alone.
  const stagingProject = env.VERCEL_PROJECT_ID === policy.vercelProjectId;
  const candidateRef = policy.candidateBranches.includes(env.VERCEL_GIT_COMMIT_REF);
  if (env.VERCEL !== "1" || (!stagingProject && !candidateRef)) {
    return { candidatePreviewGuard: "not-applicable" };
  }
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_PROJECT_ID !== policy.vercelProjectId
    || env.MUNSHIOS_DEPLOYMENT_ENVIRONMENT !== "staging") {
    throw new Error("Refusing acceptance deployment outside approved staging Preview project.");
  }
  if (env.RUN_PRISMA_MIGRATIONS_ON_BUILD !== "0") {
    throw new Error("Refusing acceptance deployment with build-time database migrations enabled or unverified.");
  }
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error("Refusing acceptance deployment without a valid database target."); }
  const prefix = url.hostname.match(/^(ep-[a-z0-9-]+?)(?:-pooler)?\.c-(?:6|7)\.us-east-2\.aws\.neon\.tech$/)?.[1];
  const denied = policy.forbiddenHostPrefixes.includes(prefix);
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !prefix || denied || !Array.isArray(approvedHosts)
    || !approvedHosts.includes(url.hostname)
    || url.pathname !== "/neondb"
    || (url.port && url.port !== "5432")
    || !url.username || !url.password || !hasSafeNeonUrlOptions(url)) {
    throw new Error("Refusing acceptance deployment: database host is not an independently approved synthetic staging target.");
  }
  return { candidatePreviewGuard: "approved" };
}

if (require.main === module) {
  try {
    assertPreviewAcceptanceTarget(process.env);
    console.log("Preview acceptance target guard passed.");
  } catch {
    console.error("Preview acceptance target guard failed. Verify approved isolated nonproduction target and environment.");
    process.exitCode = 1;
  }
}

module.exports = { assertPreviewAcceptanceTarget };
