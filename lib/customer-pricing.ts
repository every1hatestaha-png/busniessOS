export type CustomerPriceRuleLike = {
  customerId: string;
  productId: string;
  minQuantity: number;
  unitPrice: number;
  discountPerUnit: number;
  isActive: boolean;
};

export function findCustomerPriceRule(
  rules: CustomerPriceRuleLike[],
  customerId: string | null | undefined,
  productId: string,
  quantity: number,
) {
  if (!customerId || !productId || !Number.isFinite(quantity) || quantity <= 0) return null;
  return rules
    .filter((rule) =>
      rule.isActive
      && rule.customerId === customerId
      && rule.productId === productId
      && rule.minQuantity <= quantity,
    )
    .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null;
}
