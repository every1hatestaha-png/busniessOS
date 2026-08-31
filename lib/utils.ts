import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPKR(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null) return "Rs 0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs 0";
  return `Rs ${new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)}`;
}

export function calculateOrderSubtotal(items: { quantity: number; unitPrice: number | string }[]): number {
  return items.reduce((sum, item) => {
    const price = typeof item.unitPrice === "string" ? parseFloat(item.unitPrice) : item.unitPrice;
    return sum + (item.quantity * (isNaN(price) ? 0 : price));
  }, 0);
}

export function calculateOrderTotal(subtotal: number, discount: number | string): number {
  const disc = typeof discount === "string" ? parseFloat(discount) : discount;
  return Math.max(0, subtotal - (isNaN(disc) ? 0 : disc));
}

export function calculateBalance(total: number, paid: number | string): number {
  const p = typeof paid === "string" ? parseFloat(paid) : paid;
  return Math.max(0, total - (isNaN(p) ? 0 : p));
}

export function calculateLedgerRunningBalance<T extends { debit: number; credit: number }>(entries: T[]) {
  let balance = 0;
  return entries.map((entry) => ({ ...entry, balance: (balance += entry.debit - entry.credit) }));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

export function calculateInventoryValue(stock: number, costPrice: number | string): number {
  const cost = typeof costPrice === "string" ? parseFloat(costPrice) : costPrice;
  return stock * (isNaN(cost) ? 0 : cost);
}

export function getStockStatus(stock: number, reorderLevel: number): "In Stock" | "Low Stock" | "Out of Stock" {
  if (stock <= 0) return "Out of Stock";
  if (stock <= reorderLevel) return "Low Stock";
  return "In Stock";
}

export function getCreditStatus(balance: number, creditLimit: number): "Clear" | "Normal" | "Near Limit" | "Over Limit" {
  if (balance <= 0) return "Clear";
  if (balance >= creditLimit) return "Over Limit";
  if (balance >= creditLimit * 0.8) return "Near Limit";
  return "Normal";
}
