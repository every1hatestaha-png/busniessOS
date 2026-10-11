/**
 * Keyboard POS syntax: "3x biryani" adds three of one unambiguous matching dish.
 * Plain names add one. Return an empty term for incomplete prefixes.
 */
export function parsePosFastEntry(raw: string): { term: string; quantity: number } {
  const cleaned = raw.trim();
  const prefix = cleaned.match(/^([1-9]\d?)\s*[x×*]\s*(.*)$/i);
  if (!prefix) return { term: cleaned, quantity: 1 };
  return { term: prefix[2]!.trim(), quantity: Number(prefix[1]) };
}

export function isPosSearchShortcut(target: EventTarget | null) {
  if (!target || typeof target !== "object" || !("tagName" in target)) return true;
  const element = target as HTMLElement;
  return !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)
    && !element.isContentEditable
    && !element.closest?.("[contenteditable='true']");
}

/**
 * Return a candidate only if the operator identified exactly one available dish.
 * An exact menu name wins over broader substring matches, but duplicate exact
 * names are never guessed. No implicit first-item selection is permitted.
 */
export function resolvePosFastEntryItem<T extends { name: string; isAvailable: boolean }>(
  candidates: readonly T[], term: string,
): T | null {
  const normalized = term.trim().toLocaleLowerCase();
  if (!normalized) return null;
  const available = candidates.filter((item) => item.isAvailable && item.name.toLocaleLowerCase().includes(normalized));
  const exact = available.filter((item) => item.name.trim().toLocaleLowerCase() === normalized);
  if (exact.length > 0) return exact.length === 1 ? exact[0]! : null;
  return available.length === 1 ? available[0]! : null;
}
