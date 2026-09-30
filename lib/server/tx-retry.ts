import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 150;

function retryableMessage(err: unknown) {
  if (!(err instanceof Error)) return "";
  let meta = "";
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.meta) {
    try {
      meta = JSON.stringify(err.meta);
    } catch {
      meta = "";
    }
  }
  return `${err.message ?? ""} ${meta}`;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2034" || err.code === "P2028") return true;
  }

  const msg = retryableMessage(err);
  return msg.includes("TransactionWriteConflict")
    || msg.includes("could not serialize access")
    || msg.includes("serialization failure")
    || msg.includes('"originalCode":"40001"')
    || msg.includes("deadlock")
    || msg.includes("Unable to start a transaction");
}

export async function withSerializableRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number },
): Promise<T> {
  const txOptions = {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: options?.maxWait ?? 15_000,
    timeout: options?.timeout ?? 45_000,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await db.$transaction(fn, txOptions);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
