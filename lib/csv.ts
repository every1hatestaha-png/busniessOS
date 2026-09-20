export function csvEscape(value: string) {
  const normalized = value.replace(/\r?\n/g, " ").trim();
  return /[",\n]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

export function rowsToCsv(rows: string[][]) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}
