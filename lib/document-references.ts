export function deliveryChallanNumber(invoiceNumber: string) {
  const match = invoiceNumber.match(/(\d+)$/);
  if (match) return `DC-${match[1]}`;
  const safe = invoiceNumber.replace(/[^A-Za-z0-9]/g, "").slice(-12) || "0001";
  return `DC-${safe}`;
}
