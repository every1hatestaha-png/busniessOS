import "server-only";

type UnknownRecord = Record<string, unknown>;

export type ClerkWebhookEvent = { type: string; data: unknown };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function readString(record: UnknownRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readEmail(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  if (!isRecord(value)) return null;
  return readString(value, "email_address", "emailAddress", "email")?.toLowerCase() ?? null;
}

function readVerifiedEmail(value: unknown) {
  if (!isRecord(value) || !isRecord(value.verification)) return null;
  return readString(value.verification, "status") === "verified" ? readEmail(value) : null;
}

export function isClerkUserLifecycleEvent(type: string) {
  return type === "user.created" || type === "user.updated" || type === "user.deleted";
}

export function getClerkUserIdentity(data: unknown) {
  if (!isRecord(data)) return null;
  const user = isRecord(data.user) ? data.user : data;
  const id = readString(user, "id");
  if (!id) return null;

  const primaryEmailId = readString(user, "primary_email_address_id", "primaryEmailAddressId");
  const rawAddresses = user.email_addresses ?? user.emailAddresses;
  const addresses = Array.isArray(rawAddresses) ? rawAddresses : [];
  const primaryAddress = primaryEmailId
    ? addresses.find((address) => isRecord(address) && readString(address, "id") === primaryEmailId)
    : null;
  const directPrimary = user.primary_email_address ?? user.primaryEmailAddress;
  const email = readEmail(primaryAddress) ?? readEmail(directPrimary) ?? addresses.map(readEmail).find(Boolean) ?? null;
  const verifiedPrimaryEmail = readVerifiedEmail(primaryAddress) ?? readVerifiedEmail(directPrimary);

  return {
    id,
    email,
    verifiedPrimaryEmail,
    firstName: readString(user, "first_name", "firstName"),
    lastName: readString(user, "last_name", "lastName"),
  };
}
