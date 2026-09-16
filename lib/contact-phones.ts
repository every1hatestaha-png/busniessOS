const PHONE_SPLIT_PATTERN = /\r?\n|[;,|]+/g;
const MAX_CONTACT_PHONES = 6;

export function splitContactPhones(value: string | null | undefined, max = MAX_CONTACT_PHONES) {
  const seen = new Set<string>();
  const phones: string[] = [];

  for (const candidate of (value ?? "").split(PHONE_SPLIT_PATTERN)) {
    const phone = candidate.trim();
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
    if (phones.length >= max) break;
  }

  return phones;
}

export function serializeContactPhones(phones: string[]) {
  return splitContactPhones(phones.join("\n")).join("\n");
}

export function primaryContactPhone(value: string | null | undefined) {
  return splitContactPhones(value)[0] ?? "";
}

export function contactPhoneCount(value: string | null | undefined) {
  return splitContactPhones(value).length;
}

export { MAX_CONTACT_PHONES };
