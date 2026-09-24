export function isReorderAttentionNeeded(stockQuantity: number, reorderLevel: number) {
  return reorderLevel > 0 && stockQuantity <= reorderLevel;
}
