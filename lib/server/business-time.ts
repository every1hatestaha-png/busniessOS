const KARACHI_OFFSET = "+05:00";

export function businessDateKey(date: Date, timeZone = "Asia/Karachi") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function businessDayStart(date: Date, timeZone = "Asia/Karachi") {
  const dateKey = businessDateKey(date, timeZone);
  if (timeZone === "Asia/Karachi") return new Date(`${dateKey}T00:00:00.000${KARACHI_OFFSET}`);
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function businessDayEnd(date: Date, timeZone = "Asia/Karachi") {
  const dateKey = businessDateKey(date, timeZone);
  if (timeZone === "Asia/Karachi") return new Date(`${dateKey}T23:59:59.999${KARACHI_OFFSET}`);
  return new Date(`${dateKey}T23:59:59.999Z`);
}

export function businessMonthStart(date: Date, timeZone = "Asia/Karachi") {
  const dateKey = businessDateKey(date, timeZone);
  return businessDayStart(new Date(`${dateKey.slice(0, 7)}-01T12:00:00.000${timeZone === "Asia/Karachi" ? KARACHI_OFFSET : "Z"}`), timeZone);
}
