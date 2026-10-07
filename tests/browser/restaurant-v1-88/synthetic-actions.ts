import type { RestaurantV1ActionState } from "../../../app/(dashboard)/restaurant/v1-action-state";

// Isolated browser transport. Real production actions are covered separately by
// PostgreSQL/action tests; this fixture never imports server/provider modules.
export async function createPosOrderAction(_previous: RestaurantV1ActionState, form: FormData): Promise<RestaurantV1ActionState> {
  form.set("reason", "Synthetic success");
  const response = await fetch("/synthetic-mutation", { method: "POST", body: new URLSearchParams([...form.entries()].map(([key,value]) => [key,String(value)])) });
  return response.json();
}
