/**
 * Do not silently discard customer preparation choices.
 * The kitchen must receive every accepted option, in the original order.
 */
export function validateRestaurantModifiers(input: unknown): string[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error("Menu options must be a list.");
  if (input.length > 20) throw new Error("A menu item supports at most 20 options.");
  return input.map((value, index) => {
    if (typeof value !== "string") throw new Error(`Menu option ${index + 1} must be text.`);
    const option = value.trim();
    if (!option || option.length > 80) {
      throw new Error(`Menu option ${index + 1} must contain 1 to 80 characters.`);
    }
    return option;
  });
}
