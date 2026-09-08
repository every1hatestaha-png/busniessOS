export function getCreditPresentation(balance: number, creditLimit: number) {
  if (!Number.isFinite(creditLimit) || creditLimit <= 0) {
    return { usagePercent: null, value: "No monetary limit", detail: "Monetary credit limit not configured" };
  }

  const used = Math.max(0, balance);
  const usagePercent = Math.round((used / creditLimit) * 100);
  const difference = creditLimit - used;
  return {
    usagePercent,
    value: `${usagePercent}%`,
    detail: difference >= 0 ? `Rs ${difference.toLocaleString("en-PK")} available` : `Rs ${Math.abs(difference).toLocaleString("en-PK")} over limit`,
  };
}
