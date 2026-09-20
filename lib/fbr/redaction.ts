const SENSITIVE_KEY = /(authorization|bearer|token|secret|password|api[-_]?key|credential)/i;

function redactSecrets(value: string, secrets: string[]) {
  return secrets.reduce((result, secret) => {
    const normalized = secret.trim();
    return normalized ? result.split(normalized).join("[REDACTED]") : result;
  }, value);
}

export function redactSensitiveFbrData(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === "string") return redactSecrets(value, secrets);
  if (Array.isArray(value)) return value.map((entry) => redactSensitiveFbrData(entry, secrets));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitiveFbrData(entry, secrets),
    ]),
  );
}

export function sanitizeFbrErrorMessage(message: string | undefined, token?: string) {
  if (!message) return message;
  return redactSecrets(message, token ? [token] : []);
}
