const SENSITIVE_KEY = /(authorization|bearer|token|secret|password|api[-_]?key|credential)/i;

export function redactSensitiveFbrData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactSensitiveFbrData(entry));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitiveFbrData(entry),
    ]),
  );
}

export function sanitizeFbrErrorMessage(message: string | undefined, token?: string) {
  if (!message) return message;
  const trimmedToken = token?.trim();
  if (!trimmedToken) return message;
  return message.split(trimmedToken).join("[REDACTED]");
}
