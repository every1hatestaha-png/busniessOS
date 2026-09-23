import { headers } from "next/headers";
import { Webhook } from "svix";
import { getClerkUserIdentity, isClerkUserLifecycleEvent, type ClerkWebhookEvent } from "@/lib/server/clerk-webhook";
import { ClerkUserSyncConflictError, syncClerkLifecycleIdentity } from "@/lib/server/clerk-user-sync";

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  const headerStore = await headers();
  const id = headerStore.get("svix-id"); const timestamp = headerStore.get("svix-timestamp"); const signature = headerStore.get("svix-signature");
  if (!id || !timestamp || !signature) return Response.json({ error: "Missing Svix headers." }, { status: 400 });
  let event: ClerkWebhookEvent;
  try { event = new Webhook(secret).verify(await request.text(), { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature }) as ClerkWebhookEvent; }
  catch { return Response.json({ error: "Invalid signature." }, { status: 400 }); }
  if (!isClerkUserLifecycleEvent(event.type)) return Response.json({ received: true, ignored: true });
  const identity = getClerkUserIdentity(event.data);
  if (!identity) return Response.json({ error: "Invalid Clerk user payload." }, { status: 422 });
  try {
    const result = await syncClerkLifecycleIdentity(event.type, identity);
    return Response.json({ received: true, identitySync: result.synced ? "synced" : result.reason });
  } catch (error) {
    if (error instanceof ClerkUserSyncConflictError) {
      return Response.json({ error: "Verified identity conflicts with an existing MunshiOS user." }, { status: 409 });
    }
    throw error;
  }
}
