export type RestaurantActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialRestaurantActionState: RestaurantActionState = { status: "idle", message: "" };
