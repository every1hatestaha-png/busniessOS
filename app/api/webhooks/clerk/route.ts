import { headers } from "next/headers";
import { Webhook } from "svix";
import { db } from "@/lib/server/db";
import { acceptPendingInvitations } from "@/lib/server/members";

type ClerkEvent = { type: "user.created" | "user.updated" | "user.deleted"; data: { id: string; first_name?: string | null; last_name?: string | null; primary_email_address_id?: string | null; email_addresses?: Array<{ id: string; email_address: string }> } };

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  const headerStore = await headers();
  const id = headerStore.get("svix-id"); const timestamp = headerStore.get("svix-timestamp"); const signature = headerStore.get("svix-signature");
  if (!id || !timestamp || !signature) return Response.json({ error: "Missing Svix headers." }, { status: 400 });
  let event: ClerkEvent;
  try { event = new Webhook(secret).verify(await request.text(), { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature }) as ClerkEvent; }
  catch { return Response.json({ error: "Invalid signature." }, { status: 400 }); }
  if (event.type === "user.deleted") { await db.user.deleteMany({ where: { clerkId: event.data.id } }); return Response.json({ received: true }); }
  const email = event.data.email_addresses?.find((item) => item.id === event.data.primary_email_address_id)?.email_address ?? event.data.email_addresses?.[0]?.email_address;
  if (!email) return Response.json({ error: "User has no email." }, { status: 422 });
  const user = await db.user.upsert({ where: { clerkId: event.data.id }, create: { clerkId: event.data.id, email: email.toLowerCase(), firstName: event.data.first_name, lastName: event.data.last_name }, update: { email: email.toLowerCase(), firstName: event.data.first_name, lastName: event.data.last_name } });
  await acceptPendingInvitations(user.id, user.email);
  return Response.json({ received: true });
}
