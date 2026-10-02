import { expect, it, vi } from "vitest";
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
it("malformed recipe lines return controlled validation feedback", async () => {
  const { createRecipeAction } = await import("@/app/(dashboard)/restaurant/actions");
  for (const items of [[null], ["invalid"], [12], [[]]]) {
    const data = new FormData();
    data.set("finishedProductId", "f23a1f90-e139-4cde-9a03-75080eac17ae");
    data.set("itemsJson", JSON.stringify(items));
    await expect(createRecipeAction({ status: "idle", message: "" }, data)).resolves.toMatchObject({ status: "error" });
  }
});
