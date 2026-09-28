import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function deploymentRevision() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return sha ? sha.slice(0, 12) : null;
}

export async function GET() {
  try {
    // Keep database-backed readiness dependencies request-scoped so Vercel preview
    // builds without DATABASE_URL can compile. Expose only the short deployment
    // revision required by the release gate plus database readiness. Never expose
    // credentials, FBR configuration, database targets, or other security posture.
    const { checkDatabaseReadiness } = await import("@/lib/server/database-readiness");
    const readiness = await checkDatabaseReadiness();
    const revision = deploymentRevision();
    if (!readiness.ready) {
      return NextResponse.json(
        { ok: false, database: "schema_pending", revision },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, database: "ready", revision },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, database: "unavailable", revision: deploymentRevision() },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
