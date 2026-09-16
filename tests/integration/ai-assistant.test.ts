import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { askGroqBusinessAssistant } from "@/lib/server/groq-assistant";
import { db } from "@/lib/server/db";

const integration = process.env.RUN_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integration("live AI assistant", () => {
  let workspaceId = "";
  const originalGroqKey = process.env.GROQ_API_KEY;

  beforeAll(async () => {
    delete process.env.GROQ_API_KEY;
    const workspace = await db.workspace.create({ data: { name: `AI Assistant Test ${Date.now()}` } });
    workspaceId = workspace.id;
    await db.customer.create({
      data: {
        workspaceId,
        name: "Assistant Test Customer",
        currentBalance: 12_345,
        creditDays: 30,
      },
    });
  });

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
  });

  it("answers from tenant live data when Groq is not configured", async () => {
    const response = await askGroqBusinessAssistant(
      { workspaceId, workspace: { name: "AI Test", timezone: "Asia/Karachi", currency: "PKR" }, role: "OWNER" },
      "Assistant Test Customer ka balance batao",
    );

    expect(response.mode).toBe("live-fallback");
    expect(response.toolsUsed).toContain("customer_balance");
    expect(response.message).toContain("Assistant Test Customer");
    expect(response.message).toContain("Rs 12,345");
  });

  it("does not disclose financial data to STAFF", async () => {
    const response = await askGroqBusinessAssistant(
      { workspaceId, workspace: { name: "AI Test", timezone: "Asia/Karachi", currency: "PKR" }, role: "STAFF" },
      "Assistant Test Customer ka balance batao",
    );

    expect(response.mode).toBe("live-fallback");
    expect(response.message.toLowerCase()).toContain("permission");
    expect(response.message).not.toContain("12,345");
  });
});
