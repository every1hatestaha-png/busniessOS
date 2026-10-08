/**
 * Keyboard POS syntax: "3x biryani" adds three of the first matching dish.
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
