/** Cashier UI cart validation. Server reprices and validates all lines again. */
export type CashierCartLine = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
};

export const CASHIER_MAX_QUANTITY = 99;
export const CASHIER_MAX_LINES = 100;

export function addCashierItem(
  cart: CashierCartLine[],
  item: Pick<CashierCartLine, "menuItemId" | "name" | "price">,
): CashierCartLine[] {
  const existing = cart.find(line => line.menuItemId === item.menuItemId);
  if (existing) {
    return cart.map(line => line.menuItemId === item.menuItemId
      ? { ...line, quantity: Math.min(CASHIER_MAX_QUANTITY, line.quantity + 1) }
      : line);
  }
  if (cart.length >= CASHIER_MAX_LINES) return cart;
  return [...cart, { ...item, quantity: 1, notes: "" }];
}

export function changeCashierItemQuantity(cart: CashierCartLine[], menuItemId: string, delta: number) {
  return cart.map(line => line.menuItemId === menuItemId
    ? { ...line, quantity: Math.min(CASHIER_MAX_QUANTITY, Math.max(0, line.quantity + delta)) }
    : line).filter(line => line.quantity > 0);
}

export function cashierOrderLines(cart: CashierCartLine[]) {
  if (!cart.length || cart.length > CASHIER_MAX_LINES) throw new Error("Cart requires 1 to 100 items.");
  return cart.map(({ menuItemId, quantity, notes }) => {
    if (!menuItemId || !Number.isInteger(quantity) || quantity < 1 || quantity > CASHIER_MAX_QUANTITY) {
      throw new Error("Cart quantity is invalid.");
    }
    if (notes.length > 300) throw new Error("Item instructions must be 300 characters or fewer.");
    return { menuItemId, quantity, ...(notes.trim() ? { notes: notes.trim() } : {}) };
  });
}

export function cashierSubmissionSignature(form: FormData) {
  return JSON.stringify([...form.entries()].filter(([name]) => name !== "orderRequestId"));
}
