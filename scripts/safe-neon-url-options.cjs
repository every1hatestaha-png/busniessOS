/** Only canonical, single-valued options understood by both clients are allowed. */
function hasSafeNeonUrlOptions(url) {
  if (url.hash) return false;
  const values = { sslmode: ["require"], schema: ["public"], channel_binding: ["require"] };
  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (!Object.hasOwn(values, key) || seen.has(key) || !values[key].includes(value)) return false;
    seen.add(key);
  }
  return seen.has("sslmode");
}
module.exports = { hasSafeNeonUrlOptions };
