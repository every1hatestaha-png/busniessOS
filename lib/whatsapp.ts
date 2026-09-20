export function normalizeWhatsAppNumber(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppShareUrl(phone: string | null | undefined, message: string) {
  const number = normalizeWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
