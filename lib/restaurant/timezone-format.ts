/**
 * Restaurant order timestamps use each workspace's configured IANA timezone.
 * Invalid legacy values never crash the operator's live cash register.
 */
export function formatRestaurantOrderTime(date: Date, timeZone?: string | null): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium", timeStyle: "short", timeZone: timeZone || "Asia/Karachi",
  };
  try {
    return new Intl.DateTimeFormat("en-PK", options).format(date);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return new Intl.DateTimeFormat("en-PK", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi",
    }).format(date);
  }
}
