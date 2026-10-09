export type RestaurantV1ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  orderId?: string;
};

export const initialRestaurantV1ActionState: RestaurantV1ActionState = {
  status: "idle",
  message: "",
};
