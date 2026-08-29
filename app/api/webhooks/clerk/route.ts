import { headers } from "next/headers";
import { Webhook } from "svix";
import { db } from "@/lib/server/db";
import { acceptPendingInvitations } from "@/lib/server/members";
import { getClerkUserIdentity, isClerkUserLifecycleEvent, type ClerkWebhookEvent } from "@/lib/server/clerk-webhook";

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
  if (event.type === "user.deleted") { await db.user.deleteMany({ where: { clerkId: identity.id } }); return Response.json({ received: true }); }
  if (!identity.email) return Response.json({ error: "User has no email." }, { status: 422 });
  const user = await db.user.upsert({ where: { clerkId: identity.id }, create: { clerkId: identity.id, email: identity.email, firstName: identity.firstName, lastName: identity.lastName }, update: { email: identity.email, firstName: identity.firstName, lastName: identity.lastName } });
  await acceptPendingInvitations(user.id, user.email);
  return Response.json({ received: true });
}
