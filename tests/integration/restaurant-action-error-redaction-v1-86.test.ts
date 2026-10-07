import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/server/auth", () => session);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let db: typeof import("@/lib/server/db")["db"];
const runId = randomUUID();

describe("Restaurant V1.86 server action error safety", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    const user = await db.user.create({ data: { clerkId: `v186-redaction-${runId}`, email: `v186-${runId}@example.invalid` } });
    const workspace = await db.workspace.create({
      data: { name: `V1.86 action ${runId}`, members: { create: { userId: user.id, role: "OWNER" } } },
    });
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId", "moduleKey", "enabled", "config", "updatedAt")
      VALUES (${workspace.id}::uuid, 'restaurant', true, '{}'::jsonb, now())
    `;
    session.requireWorkspace.mockResolvedValue({ workspaceId: workspace.id, role: "OWNER", user });
  });
  afterAll(async () => { if (db) await db.$disconnect(); });

  it("does not expose Prisma or PostgreSQL details when a category name is duplicated", async () => {
    const { createMenuCategoryAction } = await import("@/app/(dashboard)/restaurant/v1-actions");
    const form = new FormData();
    form.set("name", "Duplicate category");
    const state = { status: "idle" as const, message: "" };
    expect((await createMenuCategoryAction(state, form)).status).toBe("success");
    const duplicate = await createMenuCategoryAction(state, form);
    expect(duplicate.status).toBe("error");
    expect(duplicate.message).not.toMatch(/prisma|query|constraint|23505|restaurant_menu_categories/i);
    expect(duplicate.message).toBe("We could not create this menu category.");
  });
});
