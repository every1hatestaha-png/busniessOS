import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for server database access.");
}

function withExplicitSslMode(url: string) {
  const parsed = new URL(url);
  const sslMode = parsed.searchParams.get("sslmode");
  if (!sslMode || ["prefer", "require", "verify-ca"].includes(sslMode)) parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const adapter = new PrismaPg({ connectionString: withExplicitSslMode(connectionString) });

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
