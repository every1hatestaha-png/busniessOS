import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 150;

function isRetryableError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === "P2034";
  }
  if (err instanceof Error) {
    const msg = err.message ?? "";
    return msg.includes("TransactionWriteConflict") || msg.includes("deadlock") || msg.includes("serialization failure") || msg.includes("Unable to start a transaction");
  }
  return false;
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
