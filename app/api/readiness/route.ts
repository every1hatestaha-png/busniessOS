import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function deploymentRevision() {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return revision ? revision.slice(0, 12) : null;
}

export async function GET() {
  try {
    // Keep database-backed readiness dependencies request-scoped so Vercel preview
    // builds without DATABASE_URL can compile. Runtime readiness still verifies the
    // real database and FBR deployment configuration before reporting ready.
    const [{ checkDatabaseReadiness }, { getFbrCredentialDeploymentReadiness }] = await Promise.all([
      import("@/lib/server/database-readiness"),
      import("@/lib/server/fbr-credentials"),
    ]);
    const readiness = await checkDatabaseReadiness();
    if (!readiness.ready) {
      return NextResponse.json(
        { ok: false, database: "schema_pending" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, database: "ready", revision: deploymentRevision(), fbr: getFbrCredentialDeploymentReadiness() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
