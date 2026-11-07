export type RestaurantV1ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  /** Present only when the cashier's order was committed successfully. */
  orderNumber?: string;
};

export const initialRestaurantV1ActionState: RestaurantV1ActionState = {
  status: "idle",
  message: "",
};
