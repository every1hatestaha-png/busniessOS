import "server-only";

import { Prisma } from "@prisma/client";

// Never serialize the exception: messages, stacks and Prisma metadata can
// contain SQL, credentials, contact details or customer-entered values.
export function reportServerFailure(area: "api" | "transaction", error: unknown) {
  const code = error instanceof Prisma.PrismaClientKnownRequestError && /^P\d{4}$/.test(error.code)
    ? error.code
    : "UNEXPECTED";
  console.error(JSON.stringify({ event: "munshios.server_failure", area, code }));
}
