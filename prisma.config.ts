import { defineConfig } from "prisma/config";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

function withExplicitSslMode(url: string | undefined) {
  if (!url) return url;
  const parsed = new URL(url);
  const sslMode = parsed.searchParams.get("sslmode");
  if (!sslMode || ["prefer", "require", "verify-ca"].includes(sslMode)) parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: withExplicitSslMode(process.env.DATABASE_URL) },
});
