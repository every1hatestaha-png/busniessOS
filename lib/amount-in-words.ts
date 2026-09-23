const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underThousand(value: number): string {
  const parts: string[] = [];
  let remaining = value;
  if (remaining >= 100) {
    parts.push(`${ONES[Math.floor(remaining / 100)]} Hundred`);
    remaining %= 100;
  }
  if (remaining >= 20) {
    parts.push(TENS[Math.floor(remaining / 10)]);
    remaining %= 10;
  }
  if (remaining > 0) parts.push(ONES[remaining]);
  return parts.join(" ");
}

function integerToWords(value: number): string {
  if (value === 0) return "Zero";
  const parts: string[] = [];
  let remaining = value;
  const groups: Array<[number, string]> = [
    [1_000_000_000, "Billion"],
    [1_000_000, "Million"],
    [1_000, "Thousand"],
  ];
  for (const [size, label] of groups) {
    if (remaining >= size) {
      const groupValue = Math.floor(remaining / size);
      parts.push(`${underThousand(groupValue)} ${label}`);
      remaining %= size;
    }
  }
  if (remaining > 0) parts.push(underThousand(remaining));
  return parts.join(" ");
}

export function formatPkrAmountInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Amount must be a non-negative finite number.");
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paisa = Math.round((rounded - rupees) * 100);
  const rupeeWords = `${integerToWords(rupees)} Rupees`;
  if (paisa === 0) return `${rupeeWords} Only`;
  return `${rupeeWords} and ${integerToWords(paisa)} Paisa Only`;
}
